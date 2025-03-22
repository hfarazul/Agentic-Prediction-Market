import { elizaLogger } from "@elizaos/core";
import { Service, ServiceType, type IAgentRuntime } from "@elizaos/core";
import { ISearchProvider, SearchProvider } from "./search";

// Import the Twitter client library using dynamic import
// We'll use a workaround to import the CommonJS module in an ES module context
let Scraper, SearchMode;

// This function will be called to initialize the imports
async function initializeImports() {
    try {
        // Use dynamic import for CommonJS modules
        const twitterClient = await import('agent-twitter-client');
        Scraper = twitterClient.Scraper;
        SearchMode = twitterClient.SearchMode;
        return true;
    } catch (error) {
        elizaLogger.error("Failed to import Twitter client:", error);
        return false;
    }
}

// Twitter search provider implementation
export class TwitterProvider implements ISearchProvider {
    name = "twitter";
    private scraper: any = null;
    private isAuthenticated = false;
    private rateLimiter: any = null; // You can implement a rate limiter similar to other providers
    private importsInitialized = false;

    constructor(
        private username: string,
        private password: string,
        private email: string,
        private apiKey: string,
        private apiSecretKey: string,
        private accessToken: string,
        private accessTokenSecret: string
    ) {
        if (!username || !password) {
            elizaLogger.warn("Twitter credentials are not set, Twitter search will not be available");
            return;
        }

        // Initialize imports and then create the scraper
        this.initializeProvider();
    }

    private async initializeProvider() {
        try {
            this.importsInitialized = await initializeImports();

            if (this.importsInitialized && Scraper) {
                this.scraper = new Scraper();
                elizaLogger.info("Initialized Twitter search provider");
            } else {
                elizaLogger.error("Failed to initialize Twitter provider: imports not available");
            }
        } catch (error) {
            elizaLogger.error("Error initializing Twitter provider:", error);
        }
    }

    async authenticate() {
        if (this.isAuthenticated) return;

        if (!this.importsInitialized) {
            await this.initializeProvider();
        }

        if (!this.scraper) {
            throw new Error("Twitter scraper not initialized");
        }

        try {
            // Check for existing cookies first
            const isLoggedIn = await this.scraper.isLoggedIn();

            if (!isLoggedIn) {
                elizaLogger.info('Logging in to Twitter...');
                await this.scraper.login(
                    this.username,
                    this.password,
                    this.email,
                    this.apiKey,
                    this.apiSecretKey,
                    this.accessToken,
                    this.accessTokenSecret
                );

                // Cache cookies for future use
                const cookies = await this.scraper.getCookies();
                elizaLogger.info('Twitter login successful, cookies cached');
            } else {
                elizaLogger.info('Already logged in to Twitter with existing cookies');
            }

            this.isAuthenticated = true;
        } catch (error) {
            elizaLogger.error('Twitter authentication failed:', error);
            this.isAuthenticated = false;
            throw new Error('Failed to authenticate with Twitter');
        }
    }

    isAvailable() {
        return !!this.scraper && this.isAuthenticated;
    }

    // Helper method to simplify tweet data
    private simplifyTweet(tweet: any) {
        if (!tweet) return null;

        return {
            text: tweet.text || '',
            likes: tweet.likes || 0,
            retweets: tweet.retweets || 0,
            replies: tweet.replies || 0,
            username: tweet.username || '',
            name: tweet.name || '',
            date: tweet.date || null,
            url: tweet.url || `https://twitter.com/${tweet.username}/status/${tweet.id}`
        };
    }

    async search(query: string, options: any = {}) {
        if (!this.isAvailable()) {
            // Try to authenticate if not already
            try {
                await this.authenticate();
            } catch (error) {
                throw new Error("Twitter client is not initialized or authenticated. Make sure Twitter credentials are set.");
            }
        }

        try {
            elizaLogger.debug(`Executing Twitter search for: "${query}"`);

            const count = options?.twitter?.count || 10;
            const mode = options?.twitter?.mode || SearchMode.Top;
            const offset = options?.twitter?.offset || 0;

            // Get search results (which is an iterator)
            const searchResults = await this.scraper.searchTweets(query, count + offset, mode);

            // Extract tweets from the iterator
            const tweets = [];

            if (typeof searchResults.next === 'function') {
                try {
                    let result = await searchResults.next();
                    let extractedCount = 0;

                    // Skip tweets for pagination
                    while (!result.done && extractedCount < offset) {
                        if (result.value) {
                            extractedCount++;
                        }
                        result = await searchResults.next();
                    }

                    // Get the requested tweets
                    extractedCount = 0;
                    while (!result.done && extractedCount < count) {
                        if (result.value) {
                            // Simplify the tweet data before adding to results
                            tweets.push(this.simplifyTweet(result.value));
                            extractedCount++;
                        }
                        result = await searchResults.next();
                    }

                    elizaLogger.debug(`Found ${tweets.length} tweets for query: "${query}" (offset: ${offset})`);
                } catch (iteratorError) {
                    elizaLogger.error('Error extracting tweets from iterator:', iteratorError);
                }
            } else if (Array.isArray(searchResults)) {
                // If it's already an array, simplify each tweet and handle pagination
                const simplifiedTweets = searchResults
                    .map(tweet => this.simplifyTweet(tweet))
                    .filter(tweet => tweet !== null);
                tweets.push(...simplifiedTweets.slice(offset, offset + count));
            }

            // Format the response to match the expected structure
            const formattedResults = tweets.map((tweet, index) => ({
                title: `Tweet by @${tweet.username}`,
                url: tweet.url,
                content: tweet.text,
                score: 1.0 - (index * 0.05), // Simple scoring based on position
                source: "twitter",
                metadata: {
                    likes: tweet.likes,
                    retweets: tweet.retweets,
                    replies: tweet.replies,
                    username: tweet.username,
                    name: tweet.name,
                    date: tweet.date
                }
            }));
            console.log(formattedResults);

            elizaLogger.debug(`Twitter search completed for: "${query}"`);

            return {
                results: formattedResults,
                provider: "twitter",
                raw: tweets
            };
        } catch (error) {
            elizaLogger.error(`Twitter search error for "${query}":`, error);
            throw error;
        }
    }

    // Additional methods that could be exposed
    async getTrends(): Promise<any> {
        await this.authenticate();

        try {
            elizaLogger.debug('Fetching current Twitter trends');
            const trends = await this.scraper.getTrends();
            return trends;
        } catch (error) {
            elizaLogger.error('Error fetching Twitter trends:', error);
            throw new Error('Failed to fetch Twitter trends');
        }
    }

    async getUserTweets(username: string, count: number = 20): Promise<any> {
        await this.authenticate();

        try {
            elizaLogger.debug(`Fetching tweets for user: ${username}`);
            const tweets = await this.scraper.getTweets(username, count);
            return tweets.map(tweet => this.simplifyTweet(tweet));
        } catch (error) {
            elizaLogger.error(`Error fetching tweets for ${username}:`, error);
            throw new Error(`Failed to fetch tweets for user: ${username}`);
        }
    }

    getSearchModes() {
        return {
            latest: SearchMode.Latest,
            top: SearchMode.Top,
            photos: SearchMode.Photos,
            videos: SearchMode.Videos
        };
    }
}

// Add Twitter to the SearchProvider enum
export const TwitterSearchProvider = "twitter";
