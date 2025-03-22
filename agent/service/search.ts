import { tavily } from "@tavily/core";
import Exa from "exa-js";
import { elizaLogger } from "@elizaos/core";
import { Service, ServiceType, type IAgentRuntime } from "@elizaos/core";

export type TavilyClient = ReturnType<typeof tavily>; // declaring manually because original package does not export its types
export type ExaClient = Exa;

export enum SearchProvider {
    TAVILY = "tavily",
    EXA = "exa",
    SERPER = "serper",
    PERPLEXITY = "perplexity",
    TWITTER = "twitter",
    ALL = "all"
}

// Base interface for search providers
export interface ISearchProvider {
    name: string;
    isAvailable(): boolean;
    search(query: string, options?: any): Promise<any>;
}

// Rate limiter for API calls
class RateLimiter {
    private queue: Array<{
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        fn: () => Promise<any>;
    }> = [];
    private processing = false;
    private requestTimes: number[] = [];
    private readonly maxPerSecond: number;

    constructor(maxPerSecond: number) {
        this.maxPerSecond = maxPerSecond;
    }

    async schedule<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({ resolve, reject, fn });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        try {
            while (this.queue.length > 0) {
                // Clean up old request times
                const now = Date.now();
                this.requestTimes = this.requestTimes.filter(time => now - time < 1000);

                // If we have max concurrent requests running and the earliest one isn't 1 sec old yet, wait
                if (this.requestTimes.length >= this.maxPerSecond) {
                    const earliestRequest = this.requestTimes[0];
                    const timeToWait = Math.max(0, earliestRequest + 1000 - now);
                    if (timeToWait > 0) {
                        await new Promise(resolve => setTimeout(resolve, timeToWait));
                        continue;
                    }
                }

                // Process next batch of requests
                const batchSize = Math.min(
                    this.maxPerSecond - this.requestTimes.length,
                    this.queue.length
                );
                const batch = this.queue.splice(0, batchSize);
                const currentTime = Date.now();

                batch.forEach(({ resolve, reject, fn }) => {
                    this.requestTimes.push(currentTime);
                    fn().then(result => {
                        resolve(result);
                    }).catch(error => {
                        reject(error);
                    });
                });
            }
        } finally {
            this.processing = false;
        }
    }
}

// Tavily search provider implementation
export class TavilyProvider implements ISearchProvider {
    name = SearchProvider.TAVILY;
    private _client: TavilyClient;

    constructor(apiKey: string) {
        if (!apiKey) {
            elizaLogger.warn("TAVILY_API_KEY is not set, Tavily search will not be available");
            return;
        }
        this._client = tavily({ apiKey });
        elizaLogger.info("Initialized Tavily search provider");
    }

    isAvailable(): boolean {
        return !!this._client;
    }

    async search(query: string, options?: any): Promise<any> {
        if (!this.isAvailable()) {
            throw new Error("Tavily client is not initialized. Make sure TAVILY_API_KEY is set.");
        }

        elizaLogger.debug(`Executing Tavily search for: "${query}"`);
        const response = await this._client.search(query, {
            includeAnswer: options?.tavily?.includeAnswer || false,
            maxResults: options?.tavily?.limit || 3,
            topic: options?.tavily?.type || "general",
            searchDepth: options?.tavily?.searchDepth || "basic",
            includeImages: options?.tavily?.includeImages || false,
        }) as any;
        elizaLogger.debug(`Tavily search completed for: "${query}"`);

        response.provider = SearchProvider.TAVILY;
        return response;
    }

    get client(): TavilyClient {
        return this._client;
    }
}

// Exa search provider implementation
export class ExaProvider implements ISearchProvider {
    name = SearchProvider.EXA;
    private _client: ExaClient | null = null;
    private rateLimiter = new RateLimiter(5); // 5 requests per second

    constructor(apiKey: string) {
        if (!apiKey) {
            elizaLogger.warn("EXA_API_KEY is not set, Exa search will not be available");
            return;
        }
        this._client = new Exa(apiKey);
        elizaLogger.info("Initialized Exa search provider");
    }

    isAvailable(): boolean {
        return !!this._client;
    }

    async search(query: string, options?: any): Promise<any> {
        if (!this.isAvailable()) {
            throw new Error("Exa client is not initialized. Make sure EXA_API_KEY is set.");
        }

        try {
            elizaLogger.debug(`Scheduling Exa search for: "${query}" (with rate limiting)`);
            // Use rate limiter for Exa API calls
            const response = await this.rateLimiter.schedule(async () => {
                elizaLogger.debug(`Executing Exa search for: "${query}"`);
                const result = await this._client.searchAndContents(
                    query,
                    {
                        moderation: options?.exa?.moderation || false,
                        useAutoprompt: options?.exa?.useAutoprompt || false,
                        type: options?.exa?.type || "keyword",
                        text: {
                            maxCharacters: options?.exa?.maxCharacters || 1000
                        },
                        contents: {
                            summary: {
                                query: "Summarize the content considering the query was " + query
                            }
                        },
                        numResults: options?.exa?.limit || 3
                    }
                );
                elizaLogger.debug(`Exa search completed for: "${query}"`);
                return result;
            }) as any;
            response.results.forEach(r => {
                r.text = r.summary ? r.summary : r.text;
            });
            response.provider = SearchProvider.EXA;
            return response;
        } catch (error) {
            elizaLogger.error(`Exa search error for "${query}":`, error);
            throw error;
        }
    }

    get client(): ExaClient {
        return this._client;
    }
}

// Perplexity search provider implementation
export class PerplexityProvider implements ISearchProvider {
    name = SearchProvider.PERPLEXITY;
    private client: any = null;
    private apiKey: string;
    private rateLimiter = new RateLimiter(5); // 5 requests per second

    constructor(apiKey: string) {
        if (!apiKey) {
            elizaLogger.warn("PERPLEXITY_API_KEY is not set, Perplexity search will not be available");
            return;
        }
        this.apiKey = apiKey;
        this.client = true; // Just a flag to indicate the provider is available
        elizaLogger.info("Initialized Perplexity search provider");
    }

    isAvailable(): boolean {
        return !!this.client;
    }

    async search(query: string, options?: any): Promise<any> {
        if (!this.isAvailable()) {
            throw new Error("Perplexity client is not initialized. Make sure PERPLEXITY_API_KEY is set.");
        }

        try {
            elizaLogger.debug(`Scheduling Perplexity search for: "${query}" (with rate limiting)`);
            // Use rate limiter for Perplexity API calls
            const response = await this.rateLimiter.schedule(async () => {
                elizaLogger.debug(`Executing Perplexity search for: "${query}"`);

                const requestOptions = {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: options?.model || "sonar",
                        messages: [
                            {
                                role: "system",
                                content: options?.systemPrompt || "Be precise and concise. Provide factual information with sources."
                            },
                            {
                                role: "user",
                                content: query
                            }
                        ],
                        max_tokens: options?.maxTokens || 500,
                        temperature: options?.temperature || 0.2,
                        top_p: options?.topP || 0.9,
                        return_related_questions: options?.returnRelatedQuestions || false,
                        search_recency_filter: options?.recencyFilter || null,
                        stream: false
                    })
                };

                const fetchResponse = await fetch('https://api.perplexity.ai/chat/completions', requestOptions);
                if (!fetchResponse.ok) {
                    throw new Error(`Perplexity API error: ${fetchResponse.status} ${fetchResponse.statusText}`);
                }

                const result = await fetchResponse.json();
                elizaLogger.debug(`Perplexity search completed for: "${query}"`);
                return result;
            });

            // Format the response to match the expected structure
            const formattedResults = response.citations ? response.citations.map((url, index) => ({
                title: `Result ${index + 1}`,
                url: url,
                content: response.choices[0].message.content,
                score: 1.0 - (index * 0.1), // Simple scoring based on citation order
                source: SearchProvider.PERPLEXITY
            })) : [];

            return {
                results: formattedResults,
                answer: response.choices[0].message.content,
                citations: response.citations || [],
                provider: SearchProvider.PERPLEXITY,
                raw: response
            };
        } catch (error) {
            elizaLogger.error(`Perplexity search error for "${query}":`, error);
            throw error;
        }
    }
}

// Serper.dev search provider implementation
export class SerperProvider implements ISearchProvider {
    name = SearchProvider.SERPER;
    private client: any = null;
    private apiKey: string;
    private rateLimiter = new RateLimiter(5); // 5 requests per second

    constructor(apiKey: string) {
        if (!apiKey) {
            elizaLogger.warn("SERPER_API_KEY is not set, Serper.dev search will not be available");
            return;
        }
        this.apiKey = apiKey;
        this.client = true; // Just a flag to indicate the provider is available
        elizaLogger.info("Initialized Serper.dev search provider");
    }

    isAvailable(): boolean {
        return !!this.client;
    }

    async search(query: string, options?: any): Promise<any> {
        if (!this.isAvailable()) {
            throw new Error("Serper.dev client is not initialized. Make sure SERPER_API_KEY is set.");
        }

        try {
            elizaLogger.debug(`Scheduling Serper.dev search for: "${query}" (with rate limiting)`);
            // Use rate limiter for Serper.dev API calls
            const response = await this.rateLimiter.schedule(async () => {
                elizaLogger.debug(`Executing Serper.dev search for: "${query}"`);

                const myHeaders = new Headers();
                myHeaders.append("X-API-KEY", this.apiKey);
                myHeaders.append("Content-Type", "application/json");

                const requestOptions = {
                    method: "POST",
                    headers: myHeaders,
                    body: JSON.stringify({
                        q: query,
                        gl: options?.serper?.gl || "us",
                        hl: options?.serper?.hl || "en",
                        autocorrect: options?.serper?.autocorrect == undefined ? false : options?.serper?.autocorrect,
                        page: options?.serper?.page || 1,
                        num: options?.serper?.num || 10
                    })
                };

                const fetchResponse = await fetch("https://google.serper.dev/search", requestOptions);
                if (!fetchResponse.ok) {
                    throw new Error(`Serper.dev API error: ${fetchResponse.status} ${fetchResponse.statusText}`);
                }

                const result = await fetchResponse.json();
                elizaLogger.debug(`Serper.dev search completed for: "${query}"`);
                return result;
            });

            // Format the response to match the expected structure
            const formattedResults = [];

            // Add organic results
            if (response.organic && response.organic.length > 0) {
                response.organic.forEach((item, index) => {
                    formattedResults.push({
                        title: item.title,
                        url: item.link,
                        content: item.snippet,
                        score: 1.0 - (index * 0.05), // Simple scoring based on position
                        source: SearchProvider.SERPER
                    });
                });
            }

            // Add knowledge graph if available
            if (response.knowledgeGraph) {
                formattedResults.push({
                    title: response.knowledgeGraph.title || "Knowledge Graph",
                    url: response.knowledgeGraph.descriptionLink || "",
                    content: response.knowledgeGraph.description || "",
                    score: 1.0, // Give knowledge graph high score
                    source: SearchProvider.SERPER
                });
            }

            // Add people also ask if available
            if (response.peopleAlsoAsk && response.peopleAlsoAsk.length > 0) {
                response.peopleAlsoAsk.forEach((item, index) => {
                    formattedResults.push({
                        title: item.question,
                        url: item.link,
                        content: item.snippet,
                        score: 0.8 - (index * 0.05), // Lower score than organic results
                        source: SearchProvider.SERPER
                    });
                });
            }

            return {
                results: formattedResults,
                provider: SearchProvider.SERPER,
                raw: response
            };
        } catch (error) {
            elizaLogger.error(`Serper.dev search error for "${query}":`, error);
            throw error;
        }
    }
}

export class WebSearchService extends Service {
    private providers: Map<string, ISearchProvider> = new Map();

    async initialize(runtime: IAgentRuntime): Promise<void> {
        // Initialize Tavily provider
        const tavilyApiKey = runtime.getSetting("TAVILY_API_KEY") as string;
        if (tavilyApiKey) {
            const tavilyProvider = new TavilyProvider(tavilyApiKey);
            if (tavilyProvider.isAvailable()) {
                this.providers.set(SearchProvider.TAVILY, tavilyProvider);
            }
        }

        // Initialize Exa provider
        const exaApiKey = runtime.getSetting("EXA_API_KEY") as string;
        if (exaApiKey) {
            const exaProvider = new ExaProvider(exaApiKey);
            if (exaProvider.isAvailable()) {
                this.providers.set(SearchProvider.EXA, exaProvider);
            }
        }

        // Initialize Perplexity provider
        const perplexityApiKey = runtime.getSetting("PERPLEXITY_API_KEY") as string;
        if (perplexityApiKey) {
            const perplexityProvider = new PerplexityProvider(perplexityApiKey);
            if (perplexityProvider.isAvailable()) {
                this.providers.set(SearchProvider.PERPLEXITY, perplexityProvider);
            }
        }

        // Initialize Twitter provider
        const twitterUsername = runtime.getSetting("TWITTER_USERNAME") as string;
        const twitterPassword = runtime.getSetting("TWITTER_PASSWORD") as string;
        const twitterEmail = runtime.getSetting("TWITTER_EMAIL") as string;
        const twitterApiKey = runtime.getSetting("TWITTER_API_KEY") as string;
        const twitterApiSecretKey = runtime.getSetting("TWITTER_API_SECRET_KEY") as string;
        const twitterAccessToken = runtime.getSetting("TWITTER_ACCESS_TOKEN") as string;
        const twitterAccessTokenSecret = runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET") as string;

        // Log the Twitter credentials (without revealing sensitive information)
        elizaLogger.debug(`Twitter credentials: Username: ${!!twitterUsername}, Password: ${!!twitterPassword}, Email: ${!!twitterEmail}, API Key: ${!!twitterApiKey}, API Secret: ${!!twitterApiSecretKey}, Access Token: ${!!twitterAccessToken}, Access Token Secret: ${!!twitterAccessTokenSecret}`);

        if (twitterUsername && twitterPassword) {
            try {
                elizaLogger.debug("Attempting to import Twitter provider...");
                const { TwitterProvider } = await import('./twitter');
                elizaLogger.debug("Twitter provider imported successfully");

                const twitterProvider = new TwitterProvider(
                    twitterUsername,
                    twitterPassword,
                    twitterEmail,
                    twitterApiKey,
                    twitterApiSecretKey,
                    twitterAccessToken,
                    twitterAccessTokenSecret
                );
                elizaLogger.debug("Twitter provider instance created");

                // Register the provider after it's authenticated
                setTimeout(async () => {
                    try {
                        elizaLogger.debug("Attempting to authenticate Twitter provider...");
                        await twitterProvider.authenticate();
                        elizaLogger.debug("Twitter provider authenticated successfully");

                        if (twitterProvider.isAvailable()) {
                            this.providers.set(SearchProvider.TWITTER, twitterProvider);
                            elizaLogger.info("Twitter provider registered successfully");
                        } else {
                            elizaLogger.warn("Twitter provider authentication succeeded but isAvailable() returned false");
                        }
                    } catch (error) {
                        elizaLogger.error("Failed to authenticate Twitter provider:", error);
                    }
                }, 1000); // Give it 1 second to authenticate
            } catch (error) {
                elizaLogger.error("Error initializing Twitter provider:", error);
                if (error instanceof Error) {
                    elizaLogger.error("Error message:", error.message);
                    elizaLogger.error("Error stack:", error.stack);
                }
            }
        }

        /* Comment out Serper.dev provider initialization
        // Initialize Serper.dev provider
        const serperApiKey = runtime.getSetting("SERPER_API_KEY") as string;
        if (serperApiKey) {
            const serperProvider = new SerperProvider(serperApiKey);
            if (serperProvider.isAvailable()) {
                this.providers.set(SearchProvider.SERPER, serperProvider);
            }
        }
        */
    }

    getInstance() {
        return WebSearchService.getInstance();
    }

    static get serviceType() {
        return ServiceType.WEB_SEARCH;
    }

    // Method to register a new search provider
    registerProvider(provider: ISearchProvider): void {
        if (provider.isAvailable()) {
            this.providers.set(provider.name, provider);
            elizaLogger.info(`Registered search provider: ${provider.name}`);
        } else {
            elizaLogger.warn(`Failed to register unavailable search provider: ${provider.name}`);
        }
    }

    async search(
        query: string,
        options?: any,
    ): Promise<any> {
        // Determine which search provider to use
        const provider = options?.provider || SearchProvider.ALL;
        elizaLogger.debug(`Search request with provider: ${provider} for query: "${query}"`);

        // If a specific provider is requested
        if (provider !== SearchProvider.ALL) {
            if (this.providers.has(provider)) {
                try {
                    return await this.providers.get(provider).search(query, options);
                } catch (error) {
                    elizaLogger.error(`Error with provider ${provider}:`, error);
                    throw error;
                }
            } else {
                throw new Error(`Requested search provider '${provider}' is not available`);
            }
        }

            // If ALL is requested, try all available providers
        const results = {};
        const combinedResults = [];
        let availableProviders = 0;
        const usedProviders = [];

        const names = [];
        const promises = [];
        for (const [name, providerInstance] of this.providers.entries()) {
            names.push(name);
            promises.push(providerInstance.search(query, options));
        }
        const providerResults = await Promise.allSettled(promises);

        let i = 0;
        for (const providerResult of providerResults) {
            const name = names[i++];

            if (providerResult.status === "fulfilled") {
                results[name] = providerResult.value;
                availableProviders++;
                usedProviders.push(name);
            } else {
                elizaLogger.error(`Error with provider ${name}:`, providerResult.reason);
                continue;
            }

            if (results[name].results) {
                for (const result of results[name].results) {
                    combinedResults.push({
                        ...result,
                        content: result.text || result.content,
                        score: result.relevance_score || result.score,
                        source: name
                    });
                }
            }
        }

        if (availableProviders === 0) {
            throw new Error("No search providers are available");
        }

        // Return combined results with list of used providers
        return {
            ...results,
            provider: SearchProvider.ALL,
            usedProviders: usedProviders,
            combinedResults
        };
    }

    // Dedicated method for Tavily search
    async searchTavily(
        query: string,
        options?: any,
    ): Promise<any> {
        return this.search(query, { ...options, provider: SearchProvider.TAVILY });
    }

    // Dedicated method for Exa search
    async searchExa(
        query: string,
        options?: any,
    ): Promise<any> {
        return this.search(query, { ...options, provider: SearchProvider.EXA });
    }

    // Dedicated method for Perplexity search
    async searchPerplexity(
        query: string,
        options?: any,
    ): Promise<any> {
        return this.search(query, { ...options, provider: SearchProvider.PERPLEXITY });
    }

    // Dedicated method for Serper.dev search
    async searchSerper(
        query: string,
        options?: any,
    ): Promise<any> {
        return this.search(query, { ...options, provider: SearchProvider.SERPER });
    }

    // Dedicated method for Twitter search
    async searchTwitter(
        query: string,
        options?: any,
    ): Promise<any> {
        return this.search(query, { ...options, provider: SearchProvider.TWITTER });
    }
}

export default WebSearchService;
