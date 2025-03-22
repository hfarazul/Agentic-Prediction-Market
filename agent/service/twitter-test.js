import dotenv from 'dotenv';
import { Scraper, SearchMode } from 'agent-twitter-client';

// Load environment variables
dotenv.config();

async function testTwitterClient() {
    console.log('Starting Twitter client test...');

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
                console.log(`\nTweet ${index + 1}:`, JSON.stringify({
                    text: tweet.text,
                    username: tweet.username,
                    likes: tweet.likes,
                    retweets: tweet.retweets
                }, null, 2));
            });
        }

        console.log('Test completed successfully!');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testTwitterClient();
