"use client";

import React, { useState, useEffect } from "react";
import { getContract, readContract } from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { client } from "@/client";
import { Abi } from "viem";
import { PredictionMarketABI } from "@/utils/abi/PredictionMarket";
import { MarketABI } from "@/utils/abi/Market";
import { contractAddresses } from "@/utils/contractAddresses";
import { ConnectButton } from "thirdweb/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";

interface Market {
    id: number;
    claim: string;
    details: string;
    creator: string;
    expiryDate: Date;
    imageUrl: string;
    marketAddress: string;
    resolverAddress: string;
    yesPrice: number;
    noPrice: number;
    totalVolume: number;
    totalYesShares: number;
    totalNoShares: number;
    yesPool: number;
    noPool: number;
    isResolved: boolean;
    marketResult: boolean;
}

export default function Markets() {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchMarkets();
    }, []);

    const fetchMarkets = async () => {
        try {
            setLoading(true);
            setError(null);

            const predictionMarket = getContract({
                client,
                chain: sepolia,
                address: contractAddresses.PREDICTIONMARKET_CONTRACT_ADDRESS,
                abi: PredictionMarketABI as Abi,
            });

            // Get the next market ID to know how many markets exist
            const nextMarketId = await readContract({
                contract: predictionMarket,
                method: "function nextMarketId() view returns (uint256)",
            });

            const totalMarkets = Number(nextMarketId) - 1;
            const marketsData: Market[] = [];

            console.log("totalMarkets", totalMarkets);

            // Fetch each market's data
            for (let i = 0; i <= totalMarkets; i++) {
                const marketData = await readContract({
                    contract: predictionMarket,
                    method: "function getMarket(uint256 marketId) external view returns (address)",
                    params: [BigInt(i)],
                });

                // Get the market contract to fetch prices
                const market = getContract({
                    client,
                    chain: sepolia,
                    address: marketData as `0x${string}`,
                    abi: MarketABI as Abi,
                });

                // Get market info for prices and other data
                const marketInfo = await readContract({
                    contract: market,
                    method: "function getMarketInfo() external view returns (address _creator, string memory _question, string memory _details, string memory _imageUrl, string memory _resolverUrl, address _resolverAddress, uint256 _totalYesShares, uint256 _totalNoShares, uint256 _yesPool, uint256 _noPool, uint256 yesPrice, uint256 noPrice, bool isResolved, bool marketResult)",
                });

                const [
                    creator,
                    claim,
                    details,
                    imageUrl,
                    resolverUrl,
                    resolverAddress,
                    totalYesShares,
                    totalNoShares,
                    yesPool,
                    noPool,
                    yesPrice,
                    noPrice,
                    isResolved,
                    marketResult,
                ] = marketInfo;

                // Fetch current ETH price in USD
                const ethPrice = await fetch(
                    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
                ).then((res) => res.json());

                const ethUsdPrice = ethPrice.ethereum.usd;

                // Convert prices from ETH to USD
                const yesPriceUsd = (Number(yesPrice) * ethUsdPrice) / 1e18;
                const noPriceUsd = (Number(noPrice) * ethUsdPrice) / 1e18;

                marketsData.push({
                    id: i,
                    creator: creator,
                    claim: claim,
                    details: details,
                    expiryDate: new Date(
                        Number(Date.now()) + 1000 * 60 * 60 * 24 * 7
                    ),
                    imageUrl: imageUrl,
                    marketAddress: marketData as `0x${string}`,
                    resolverAddress: resolverAddress,
                    yesPrice: yesPriceUsd,
                    noPrice: noPriceUsd,
                    totalYesShares: Number(totalYesShares) / 1e18,
                    totalNoShares: Number(totalNoShares) / 1e18,
                    yesPool: Number(yesPool) / 1e18,
                    noPool: Number(noPool) / 1e18,
                    isResolved: isResolved,
                    marketResult: marketResult,
                    totalVolume: (Number(yesPool) + Number(noPool)) / 1e18,
                });
            }

            setMarkets(marketsData);
        } catch (err: any) {
            console.error("Error fetching markets:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-[#1A202C] text-white">
            {/* Header */}
            <header className="border-b border-gray-800 p-4">
                <div className="container mx-auto flex justify-between items-center">
                    <Link
                        href="/"
                        className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text"
                    >
                        Truthseeker
                    </Link>
                    <ConnectButton client={client} />
                </div>
            </header>

            <main className="container mx-auto py-8 px-4">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold">Active Markets</h1>
                    <Link
                        href="/"
                        className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-md text-white"
                    >
                        Create Market
                    </Link>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-red-500 text-center p-4 bg-red-500/10 rounded-lg">
                        {error}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {markets.map((market) => (
                            <Link
                                key={market.id}
                                href={`/market/${market.id}`}
                                className={`bg-gray-900 rounded-lg p-6 hover:bg-gray-800 transition-colors ${
                                    market.isResolved
                                        ? "border-2 border-blue-500"
                                        : ""
                                }`}
                            >
                                {market.imageUrl && (
                                    <img
                                        src={market.imageUrl}
                                        alt={market.claim}
                                        className="w-full h-48 object-cover rounded-lg mb-4"
                                    />
                                )}
                                <div className="flex items-center gap-2 mb-2">
                                    {market.isResolved && (
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                market.marketResult
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-red-500/20 text-red-400"
                                            }`}
                                        >
                                            Resolved:{" "}
                                            {market.marketResult ? "YES" : "NO"}
                                        </span>
                                    )}
                                    <h2 className="text-lg font-semibold">
                                        {market.claim}
                                    </h2>
                                </div>
                                <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                                    {market.details}
                                </p>
                                <div className="flex justify-between items-center text-sm">
                                    <div className="text-gray-400">
                                        Expires: {formatDate(market.expiryDate)}
                                    </div>
                                    <div className="text-gray-400">
                                        Volume: ${market.totalVolume.toFixed(2)}
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-4">
                                    <div className="bg-green-500/20 p-2 rounded-md">
                                        <div className="text-green-400 text-center">
                                            Yes
                                        </div>
                                        <div className="font-medium text-center">
                                            ${market.yesPrice.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-gray-400 text-center mt-1">
                                            Pool: {market.yesPool.toFixed(2)}{" "}
                                            ETH
                                        </div>
                                        <div className="text-xs text-gray-400 text-center">
                                            Shares:{" "}
                                            {market.totalYesShares.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="bg-red-500/20 p-2 rounded-md">
                                        <div className="text-red-400 text-center">
                                            No
                                        </div>
                                        <div className="font-medium text-center">
                                            ${market.noPrice.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-gray-400 text-center mt-1">
                                            Pool: {market.noPool.toFixed(2)} ETH
                                        </div>
                                        <div className="text-xs text-gray-400 text-center">
                                            Shares:{" "}
                                            {market.totalNoShares.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
