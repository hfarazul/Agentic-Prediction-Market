// search-test.ts - TypeScript test script for Tavily and Exa search providers
import dotenv from 'dotenv';
import { tavily } from "@tavily/core";
import Exa from "exa-js";

// Load environment variables from the local .env file
dotenv.config();

// Get API keys from environment variables or use hardcoded values from .env
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "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";
const EXA_API_KEY = process.env.EXA_API_KEY || "3b5bcaa6-44ca-4e51-ae97-362f7775b6cc";

console.log("Using Tavily API Key:", TAVILY_API_KEY ? "✅ Found" : "❌ Missing");
console.log("Using Exa API Key:", EXA_API_KEY ? "✅ Found" : "❌ Missing");

// Initialize clients
const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });
const exaClient = new Exa(EXA_API_KEY);

// Test query
const query = "What are the latest developments in quantum computing?";

async function runTests() {
  console.log("🔍 Testing search providers with query:", query);
  console.log("----------------------------------------");

  // Test Tavily
  try {
    console.log("📚 Testing Tavily search...");
    const tavilyResponse = await tavilyClient.search(query, {
      includeAnswer: true,
      maxResults: 3,
    });

    console.log("✅ Tavily search successful!");
    console.log(`📊 Found ${tavilyResponse.results?.length || 0} results`);
    console.log("📝 First result:", tavilyResponse.results?.[0]?.title || "No results");
    console.log("🔗 URL:", tavilyResponse.results?.[0]?.url || "N/A");
  } catch (error) {
    console.error("❌ Tavily search failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("----------------------------------------");

  // Test Exa
  try {
    console.log("📚 Testing Exa search...");
    const exaResponse = await exaClient.searchAndContents(query, {
      type: "auto",
      text: {
        maxCharacters: 1000
      },
      numResults: 3
    });

    console.log("✅ Exa search successful!");
    console.log(`📊 Found ${exaResponse.results?.length || 0} results`);
    console.log("📝 First result:", exaResponse.results?.[0]?.title || "No results");
    console.log("🔗 URL:", exaResponse.results?.[0]?.url || "N/A");
  } catch (error) {
    console.error("❌ Exa search failed:", error instanceof Error ? error.message : String(error));
  }
}

// Run the tests
runTests().catch(error => {
  console.error("❌ Test execution failed:", error instanceof Error ? error.message : String(error));
});
