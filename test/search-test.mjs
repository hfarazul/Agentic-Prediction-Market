// search-test.mjs - Test script for Tavily, Exa, and Serper search providers
import dotenv from 'dotenv';
import { tavily } from "@tavily/core";
import Exa from "exa-js";
// Node.js v18+ has built-in fetch

// Load environment variables from the local .env file
dotenv.config();

// Get API keys from environment variables or use hardcoded values from .env
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "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";
const EXA_API_KEY = process.env.EXA_API_KEY || "3b5bcaa6-44ca-4e51-ae97-362f7775b6cc";
const SERPER_API_KEY = process.env.SERPER_API_KEY || ""; // Add your default key here if needed

console.log("Using Tavily API Key:", TAVILY_API_KEY ? "✅ Found" : "❌ Missing");
console.log("Using Exa API Key:", EXA_API_KEY ? "✅ Found" : "❌ Missing");
console.log("Using Serper API Key:", SERPER_API_KEY ? "✅ Found" : "❌ Missing");

// Initialize clients
const tavilyClient = tavily({ apiKey: TAVILY_API_KEY });
const exaClient = new Exa(EXA_API_KEY);
// Serper doesn't have a client library, we'll use fetch directly

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
    console.error("❌ Tavily search failed:", error.message);
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
    console.error("❌ Exa search failed:", error.message);
  }

  console.log("----------------------------------------");

  // Test Serper
  if (SERPER_API_KEY) {
    try {
      console.log("📚 Testing Serper.dev search...");

      const myHeaders = new Headers();
      myHeaders.append("X-API-KEY", SERPER_API_KEY);
      myHeaders.append("Content-Type", "application/json");

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: JSON.stringify({
          q: query,
          gl: "us",
          hl: "en",
          autocorrect: true
        })
      };

      const response = await fetch("https://google.serper.dev/search", requestOptions);

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
      }

      const serperResponse = await response.json();

      console.log("✅ Serper.dev search successful!");
      console.log(`📊 Found ${serperResponse.organic?.length || 0} organic results`);

      if (serperResponse.organic && serperResponse.organic.length > 0) {
        console.log("📝 First result:", serperResponse.organic[0].title || "No title");
        console.log("🔗 URL:", serperResponse.organic[0].link || "N/A");
      }

      if (serperResponse.knowledgeGraph) {
        console.log("📚 Knowledge Graph:", serperResponse.knowledgeGraph.title || "N/A");
      }

    } catch (error) {
      console.error("❌ Serper.dev search failed:", error.message);
    }
  } else {
    console.log("⚠️ Skipping Serper.dev test - API key not provided");
  }
}

// Run the tests
runTests().catch(error => {
  console.error("❌ Test execution failed:", error);
});
