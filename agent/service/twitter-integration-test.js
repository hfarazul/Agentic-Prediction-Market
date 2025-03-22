import dotenv from 'dotenv';
import { Scraper, SearchMode } from 'agent-twitter-client';

// Load environment variables
dotenv.config();

async function testTwitterIntegration() {
    console.log('Starting Twitter integration test...');

    const scraper = new Scraper();

    try {
        // Check if already logged in
        const isLoggedIn = await scraper.isLoggedIn();
        console.log('Already logged in:', isLoggedIn);

        if (!isLoggedIn) {
            console.log('Logging in to Twitter...');
            await scraper.login(
                process.env.TWITTER_USERNAME,
                process.env.TWITTER_PASSWORD,
                process.env.TWITTER_EMAIL,
                process.env.TWITTER_API_KEY,
                process.env.TWITTER_API_SECRET_KEY,
                process.env.TWITTER_ACCESS_TOKEN,
                process.env.TWITTER_ACCESS_TOKEN_SECRET
            );
            console.log('Login successful');
        }

        // Test search
        const query = process.argv[2] || 'climate change';
        console.log(`Searching for tweets with query: "${query}"`);

        const searchResults = await scraper.searchTweets(query, 5, SearchMode.Top);

        // Extract tweets from the iterator
        const tweets = [];

        if (typeof searchResults.next === 'function') {
            let result = await searchResults.next();
            let count = 0;

            while (!result.done && count < 5) {
                if (result.value) {
                    tweets.push(result.value);
                    count++;
                }
                result = await searchResults.next();
            }
        } else if (Array.isArray(searchResults)) {
            tweets.push(...searchResults.slice(0, 5));
        }

        console.log(`Found ${tweets.length} tweets`);
        if (tweets.length > 0) {
            tweets.forEach((tweet, index) => {
                console.log(`\nTweet ${index + 1}:`);
                console.log(`Username: @${tweet.username}`);
                console.log(`Name: ${tweet.name}`);
                console.log(`Text: ${tweet.text}`);
                console.log(`Likes: ${tweet.likes}`);
                console.log(`Retweets: ${tweet.retweets}`);
                console.log(`URL: ${tweet.url || `https://twitter.com/${tweet.username}/status/${tweet.id}`}`);
            });
        }

        // Test formatting the tweets as search results
        console.log('\nFormatting tweets as search results:');
        const formattedResults = tweets.map((tweet, index) => ({
            title: `Tweet by @${tweet.username}`,
            url: tweet.url || `https://twitter.com/${tweet.username}/status/${tweet.id}`,
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

        console.log(`Formatted ${formattedResults.length} search results`);
        if (formattedResults.length > 0) {
            console.log('First formatted result:', JSON.stringify(formattedResults[0], null, 2));
        }

        console.log('\nTest completed successfully!');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testTwitterIntegration();
