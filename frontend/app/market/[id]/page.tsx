"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
    getContract,
    prepareTransaction,
    readContract,
    sendAndConfirmTransaction,
} from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";

import { client } from "@/client";
import { Abi, encodeFunctionData } from "viem";
import { PredictionMarketABI } from "@/utils/abi/PredictionMarket";
import { MarketABI } from "@/utils/abi/Market";
import { contractAddresses } from "@/utils/contractAddresses";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import {
    Loader2,
    CheckCircle,
    XCircle,
    CircleHelp,
    Clock,
    ChevronDown,
    Calendar,
    ShieldCheck,
    Users,
} from "lucide-react";
import Link from "next/link";
import PriceChart from "@/components/PriceChart";
import TruthOrb from "@/truth-orb";
import axios from "axios";
import LogDisplay from "@/components/LogDisplay";
import { Button } from "@/components/ui/button";
import { ResolverABI } from "@/utils/abi/Resolver";

export default function MarketPage() {
    const params = useParams();
    const marketId = params.id as string;
    const account = useActiveAccount();

    // States from main page
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showDashboard, setShowDashboard] = useState(true);
    const [activeView, setActiveView] = useState<"user" | "admin">("user");
    const [activeTab, setActiveTab] = useState("all");
    const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
    const [selectedPosition, setSelectedPosition] = useState<
        "yes" | "no" | null
    >(null);
    const [betAmount, setBetAmount] = useState("1");
    const [txStatus, setTxStatus] = useState<
        "idle" | "pending" | "success" | "error"
    >("idle");
    const [txError, setTxError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    // Market data states
    const [marketData, setMarketData] = useState<{
        claim: string;
        details: string;
        imageUrl: string;
        expiryDate: Date;
        marketAddress: string;
        resolverAddress: string;
    } | null>(null);

    // Market state
    const [marketQuantities, setMarketQuantities] = useState<number[]>([0, 0]); // [yes, no]
    const [sharePrices, setSharePrices] = useState({
        yesPriceUsd: 0,
        noPriceUsd: 0,
    });

    // User positions
    const [userPositions, setUserPositions] = useState<
        {
            type: "yes" | "no";
            amount: number;
            price: number;
            quantity: number;
        }[]
    >([]);

    // Add these states for verification
    const [isVerifying, setIsVerifying] = useState(false);
    const [result, setResult] = useState<null | {
        decision: "true" | "false" | "depends" | "inconclusive" | "too_early";
        confidence: number;
        reason: string;
    }>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isMarketResolved, setIsMarketResolved] = useState(false);
    const [resolvedOutcome, setResolvedOutcome] = useState<"yes" | "no" | null>(
        null
    );
    const [totalWinnings, setTotalWinnings] = useState(0);
    const [isClaimingWinnings, setIsClaimingWinnings] = useState(false);
    const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

    // Add state for resolution request
    const [isRequestingResolution, setIsRequestingResolution] = useState(false);
    const [resolutionRequestTxHash, setResolutionRequestTxHash] = useState<
        string | null
    >(null);

    useEffect(() => {
        fetchMarketData();
    }, [marketId]);

    const fetchMarketData = async () => {
        try {
            setLoading(true);
            setError(null);

            const predictionMarket = getContract({
                client,
                chain: sepolia,
                address: contractAddresses.PREDICTIONMARKET_CONTRACT_ADDRESS,
                abi: PredictionMarketABI as Abi,
            });

            // Get market data
            const marketData = await readContract({
                contract: predictionMarket,
                method: "function getMarket(uint256 marketId) external view returns (address)",
                params: [BigInt(marketId)],
            });

            // Get the market contract
            const market = getContract({
                client,
                chain: sepolia,
                address: marketData as `0x${string}`,
                abi: MarketABI as Abi,
            });

            // Get market info
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

            // Update market resolved status and outcome
            setIsMarketResolved(isResolved);
            setResolvedOutcome(
                isResolved ? (marketResult ? "yes" : "no") : null
            );

            // If market is resolved and user has positions, calculate winnings
            if (isResolved && account) {
                const position = await readContract({
                    contract: market,
                    method: "function getPosition(address user) view returns (uint256 yesShares, uint256 noShares)",
                    params: [account.address],
                });

                const [yesShares, noShares] = position;
                const winningShares = marketResult ? yesShares : noShares;

                if (winningShares > 0n) {
                    // Convert from wei to ETH (divide by 1e18)
                    const winningsInEth = Number(winningShares) / 1e18;
                    setTotalWinnings(winningsInEth);
                } else {
                    setTotalWinnings(0);
                }
            }

            // Fetch current ETH price in USD
            const ethPrice = await fetch(
                "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
            ).then((res) => res.json());

            //if eth price is not available, set to 1200
            const ethUsdPrice = ethPrice.ethereum.usd || 1200;

            // Convert prices from ETH to USD
            const yesPriceUsd = (Number(yesPrice) * ethUsdPrice) / 1e18;
            const noPriceUsd = (Number(noPrice) * ethUsdPrice) / 1e18;

            setMarketData({
                claim,
                details,
                imageUrl,
                expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days from now
                marketAddress: marketData as `0x${string}`,
                resolverAddress,
            });

            setMarketQuantities([
                Number(yesPool) / 1e18,
                Number(noPool) / 1e18,
            ]);

            setSharePrices({
                yesPriceUsd,
                noPriceUsd,
            });

            // If user is connected, fetch their positions
            if (account) {
                const position = await readContract({
                    contract: market,
                    method: "function getPosition(address user) view returns (uint256 yesShares, uint256 noShares)",
                    params: [account.address],
                });

                const [yesShares, noShares] = position;

                setUserPositions([
                    {
                        type: "yes",
                        amount: Number(yesShares) / 1e18,
                        price: yesPriceUsd,
                        quantity: Number(yesShares) / 1e18,
                    },
                    {
                        type: "no",
                        amount: Number(noShares) / 1e18,
                        price: noPriceUsd,
                        quantity: Number(noShares) / 1e18,
                    },
                ]);
            }
        } catch (err: any) {
            console.error("Error fetching market data:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle position selection
    const handleSelectPosition = (position: "yes" | "no") => {
        setSelectedPosition(position);
    };

    // Handle buying position
    const handleBuyPosition = async () => {
        if (!selectedPosition || !account) return;
        setTxStatus("pending");
        setTxError(null);
        setTxHash(null);

        try {
            const market = getContract({
                client,
                chain: sepolia,
                address: marketData?.marketAddress as string,
                abi: MarketABI as Abi,
            });

            // Amount to spend
            const amount = Number(betAmount);
            if (amount <= 0) return;

            const tx = await encodeFunctionData({
                abi: MarketABI as Abi,
                functionName: "buyShares",
                args: [selectedPosition === "yes"],
            });

            //convert USD to ETH using the price of ETH fetched from CoinGecko
            const ethPrice = await fetch(
                "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
            ).then((res) => res.json());

            const ethUsdPrice = ethPrice.ethereum.usd || 1200;
            const amountInEth = amount / ethUsdPrice;

            // Convert to wei and ensure it's an integer
            const amountInWei = BigInt(Math.floor(amountInEth * 1e18));

            console.log("amountInWei", amountInWei.toString());

            const transaction = await prepareTransaction({
                chain: sepolia,
                client,
                to: market.address,
                data: tx,
                value: amountInWei,
            });

            const receipt = await sendAndConfirmTransaction({
                transaction,
                account,
            });

            // Set the transaction hash
            setTxHash(receipt.transactionHash);

            // Open Etherscan in new tab
            window.open(
                `https://sepolia.etherscan.io/tx/${receipt.transactionHash}#eventlog`,
                "_blank"
            );

            // Update UI state
            setTxStatus("success");

            // Reset bet amount and selected position
            setBetAmount("1");
            setSelectedPosition(null);

            // Refresh market data
            fetchMarketData();
        } catch (error: any) {
            console.error("Error buying shares:", error);
            setTxStatus("error");
            setTxError(error.message);
        }
    };

    // Function to resolve market based on verification result
    const resolveMarket = (decision: string) => {
        // Map verification decision to market outcome
        let outcome: "yes" | "no" | null = null;

        if (decision === "true") {
            outcome = "yes";
        } else if (decision === "false") {
            outcome = "no";
        } else {
            // For inconclusive/depends/too_early, we could implement different resolution rules
            // Here we're just returning stakes as a simple implementation
            return;
        }

        setResolvedOutcome(outcome);
        setIsMarketResolved(true);

        // Calculate winnings
        let winnings = 0;
        userPositions.forEach((position) => {
            if (position.type === outcome) {
                // Winners get their stake plus winnings based on the price
                winnings += position.amount / position.price;
            }
        });

        setTotalWinnings(winnings);
    };

    // Update handleVerify function
    const handleVerify = async () => {
        if (!marketData?.claim.trim() || !account) return;

        setIsRequestingResolution(true);
        setIsVerifying(false);
        setLogs([]);
        setResult(null);
        setTxError(null);

        try {
            // Step 1: Request resolution through Resolver contract
            const resolver = getContract({
                client,
                chain: sepolia,
                address: marketData.resolverAddress,
                abi: ResolverABI as Abi,
            });

            const tx = await encodeFunctionData({
                abi: ResolverABI as Abi,
                functionName: "requestResolution",
                args: [marketData.marketAddress, "https://example.com/eth.png"], // TODO: Replace with actual URL
            });

            const transaction = await prepareTransaction({
                chain: sepolia,
                client,
                to: resolver.address,
                data: tx,
            });

            const receipt = await sendAndConfirmTransaction({
                transaction,
                account,
            });

            setResolutionRequestTxHash(receipt.transactionHash);
            setLogs((prev) => [
                ...prev,
                "[info] Resolution request submitted to Resolver contract",
            ]);

            // Step 2: Start verification through agent
            setIsVerifying(true);
            setIsRequestingResolution(false);

            const aggregator = await verifyClaimWithProgress(
                marketData.claim,
                setLogs
            );

            const verificationResult = {
                decision: aggregator.decision,
                confidence: aggregator.confidence,
                reason: aggregator.reason,
            };

            setResult(verificationResult);

            // Step 3: Post result back to Resolver contract
            const resolveMarketTx = await encodeFunctionData({
                abi: ResolverABI as Abi,
                functionName: "resolveMarket",
                args: [
                    marketData.marketAddress,
                    verificationResult.decision === "true",
                ],
            });

            const resolveTransaction = await prepareTransaction({
                chain: sepolia,
                client,
                to: resolver.address,
                data: resolveMarketTx,
            });

            const agentWallet = privateKeyToAccount({
                client,
                privateKey: process.env
                    .NEXT_PUBLIC_AGENT_PRIVATE_KEY as `0x${string}`,
            });

            const resolveReceipt = await sendAndConfirmTransaction({
                transaction: resolveTransaction,
                account: agentWallet,
            });

            setLogs((prev) => [
                ...prev,
                `[info] Verification result submitted on-chain. Transaction: https://sepolia.etherscan.io/tx/${resolveReceipt.transactionHash}`,
            ]);
            setTxHash(resolveReceipt.transactionHash);
            setTxStatus("success");

            // Update local state
            resolveMarket(verificationResult.decision);
        } catch (e: any) {
            console.error("Error in verification process:", e);
            setLogs((prev) => [
                ...prev,
                `[error] Error in verification process: ${e.message}`,
            ]);
            setTxError(e.message);
        } finally {
            setIsRequestingResolution(false);
            setIsVerifying(false);
        }
    };

    // Function to handle incremental updates
    const verifyClaimWithProgress = async (
        claim: string,
        setLogsFunction?: React.Dispatch<React.SetStateAction<string[]>>
    ) => {
        const API_URL = "http://localhost:3000/truthseeker/";
        // Create a controller to abort the fetch if needed
        const controller = new AbortController();
        const { signal } = controller;

        try {
            // Make the initial request to start the verification
            const response = await axios.post(
                API_URL + "verify-claim-frontend",
                {
                    claim,
                }
            );
            const verificationId = response.data.verificationId;

            // Poll for updates
            let completed = false;
            let result = null;

            while (!completed) {
                // Wait a short time between polls
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Get the latest status
                const statusResponse = await axios.get(
                    API_URL + `verify-claim-frontend-status/${verificationId}`,
                    { signal }
                );
                const status = statusResponse.data;

                // Add any new logs
                if (status.logs && status.logs.length > 0 && setLogsFunction) {
                    setLogsFunction((prev) => [...prev, ...status.logs]);
                }

                // Check if completed
                if (status.completed) {
                    completed = true;
                    result = status.result;
                }
            }

            return result;
        } catch (error: any) {
            if (error.name === "AbortError") {
                console.log("Fetch aborted");
            } else {
                throw error;
            }
        } finally {
            controller.abort(); // Clean up
        }
    };

    // Add color mappings
    const color = {
        true: "bg-green-400",
        false: "bg-red-400",
        depends: "bg-yellow-400",
        inconclusive: "bg-gray-400",
        too_early: "bg-blue-400",
    };

    const bgColor = {
        true: "bg-green-500",
        false: "bg-red-500",
        depends: "bg-yellow-500",
        inconclusive: "bg-gray-500",
        too_early: "bg-blue-500",
    };

    const circle = {
        true: <CheckCircle className="h-12 w-12 text-green-500" />,
        false: <XCircle className="h-12 w-12 text-red-500" />,
        depends: <CheckCircle className="h-12 w-12 text-yellow-500" />,
        inconclusive: <CircleHelp className="h-12 w-12 text-gray-500" />,
        too_early: <Clock className="h-12 w-12 text-blue-500" />,
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    // Add handleClaimWinnings function
    const handleClaimWinnings = async () => {
        if (!account || !marketData || !isMarketResolved) return;

        setIsClaimingWinnings(true);
        setTxError(null);

        try {
            const market = getContract({
                client,
                chain: sepolia,
                address: marketData.marketAddress,
                abi: MarketABI as Abi,
            });

            const tx = await encodeFunctionData({
                abi: MarketABI as Abi,
                functionName: "claimWinnings",
                args: [],
            });

            const transaction = await prepareTransaction({
                chain: sepolia,
                client,
                to: market.address,
                data: tx,
            });

            const receipt = await sendAndConfirmTransaction({
                transaction,
                account,
            });

            setClaimTxHash(receipt.transactionHash);
            setLogs((prev) => [
                ...prev,
                `[info] Winnings claimed successfully. Transaction: https://sepolia.etherscan.io/tx/${receipt.transactionHash}`,
            ]);

            // Reset winnings after successful claim
            setTotalWinnings(0);

            // Refresh market data to update positions
            await fetchMarketData();
        } catch (e: any) {
            console.error("Error claiming winnings:", e);
            setTxError(e.message);
        } finally {
            setIsClaimingWinnings(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#1A202C] text-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !marketData) {
        return (
            <div className="min-h-screen bg-[#1A202C] text-white p-8">
                <div className="max-w-2xl mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4">
                        Error Loading Market
                    </h1>
                    <p className="text-gray-400 mb-6">
                        {error || "Market not found"}
                    </p>
                    <Link
                        href="/markets"
                        className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-md text-white"
                    >
                        Back to Markets
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#1A202C] text-white">
            {/* Header with navigation */}
            <header className="border-b border-gray-800 p-4">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-6">
                        <Link href="/" className="flex items-center space-x-2">
                            <TruthOrb className="h-8 w-8" />
                            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
                                Prediction Market
                            </h1>
                        </Link>
                        <Link
                            href="/markets"
                            className="text-gray-300 hover:text-white transition-colors"
                        >
                            Browse Markets
                        </Link>
                    </div>

                    <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
                        <button
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                activeView === "user"
                                    ? "bg-gray-700 text-white"
                                    : "text-gray-400 hover:text-white"
                            }`}
                            onClick={() => setActiveView("user")}
                        >
                            <Users className="h-4 w-4 inline mr-1" />
                            User View
                        </button>
                        <button
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                activeView === "admin"
                                    ? "bg-gray-700 text-white"
                                    : "text-gray-400 hover:text-white"
                            }`}
                            onClick={() => setActiveView("admin")}
                        >
                            <ShieldCheck className="h-4 w-4 inline mr-1" />
                            Admin View
                        </button>
                    </div>

                    <ConnectButton client={client} />
                </div>
            </header>

            <div className="flex-1 p-4 sm:p-8">
                <div className="max-w-6xl mx-auto">
                    <div className="space-y-8">
                        {/* Market Header */}
                        <div className="bg-gray-900 rounded-lg p-6 shadow-xl">
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Left column with image */}
                                {marketData.imageUrl && (
                                    <div className="md:w-1/3">
                                        <img
                                            src={marketData.imageUrl}
                                            alt="Market illustration"
                                            className="rounded-lg w-full h-auto object-cover border border-gray-700"
                                        />
                                    </div>
                                )}

                                {/* Right column with market info */}
                                <div
                                    className={
                                        marketData.imageUrl
                                            ? "md:w-2/3"
                                            : "w-full"
                                    }
                                >
                                    <h2 className="text-2xl font-bold mb-4">
                                        {marketData.claim}
                                    </h2>

                                    {marketData.details && (
                                        <div className="mb-4 bg-gray-800 p-4 rounded-md border border-gray-700">
                                            <p className="text-gray-300 whitespace-pre-line">
                                                {marketData.details}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                                        <div>
                                            Volume: $
                                            {(
                                                (marketQuantities[0] +
                                                    marketQuantities[1]) *
                                                1500
                                            ).toFixed(2)}
                                        </div>
                                        <div className="flex items-center">
                                            <Clock className="h-4 w-4 mr-1" />
                                            Expires:{" "}
                                            {formatDate(marketData.expiryDate)}
                                        </div>
                                    </div>

                                    <div className="flex items-center mb-6">
                                        <div className="mr-2 text-lg font-bold">
                                            <span className="text-blue-400">
                                                {(
                                                    (marketQuantities[0] /
                                                        (marketQuantities[0] +
                                                            marketQuantities[1])) *
                                                    100
                                                ).toFixed(1)}
                                                % chance
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Price Chart */}
                            <div className="mt-6">
                                <PriceChart
                                    currentProbability={
                                        (marketQuantities[0] /
                                            (marketQuantities[0] +
                                                marketQuantities[1])) *
                                        100
                                    }
                                    outcome={
                                        marketQuantities[0] >
                                        marketQuantities[1]
                                            ? "yes"
                                            : "no"
                                    }
                                />
                            </div>

                            {/* Time period tabs */}
                            <div className="flex text-sm mb-6">
                                <button
                                    className={`px-2 py-1 ${
                                        activeTab === "all"
                                            ? "bg-gray-800 rounded-full text-white"
                                            : "text-gray-500"
                                    }`}
                                    onClick={() => setActiveTab("all")}
                                >
                                    ALL
                                </button>
                            </div>
                        </div>

                        {/* Trading Panel */}
                        {activeView === "user" && (
                            <div className="bg-gray-900 rounded-lg shadow-xl">
                                <div className="border-b border-gray-800 px-6 py-4">
                                    <div className="flex space-x-2">
                                        <button
                                            className={`text-lg font-medium pb-2 ${
                                                tradeTab === "buy"
                                                    ? "border-b-2 border-white"
                                                    : "text-gray-500"
                                            }`}
                                            onClick={() => setTradeTab("buy")}
                                        >
                                            Buy
                                        </button>
                                        <button
                                            className={`text-lg font-medium pb-2 ${
                                                tradeTab === "sell"
                                                    ? "border-b-2 border-white"
                                                    : "text-gray-500"
                                            }`}
                                            onClick={() => setTradeTab("sell")}
                                        >
                                            Sell
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6">
                                    {/* User Positions */}
                                    {userPositions.length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="text-lg font-medium mb-3">
                                                Your Positions
                                            </h3>
                                            <div className="space-y-2">
                                                {userPositions.map(
                                                    (position, index) => (
                                                        <div
                                                            key={index}
                                                            className={`border rounded-lg p-4 ${
                                                                isMarketResolved
                                                                    ? position.type ===
                                                                      resolvedOutcome
                                                                        ? "border-green-500 bg-green-900/20"
                                                                        : "border-red-500 bg-red-900/20"
                                                                    : "border-gray-700"
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-center mb-2">
                                                                <div className="flex items-center">
                                                                    <div
                                                                        className={`h-6 w-6 rounded-full mr-2 ${
                                                                            position.type ===
                                                                            "yes"
                                                                                ? "bg-green-500"
                                                                                : "bg-red-500"
                                                                        }`}
                                                                    ></div>
                                                                    <span className="font-medium">
                                                                        {position.type ===
                                                                        "yes"
                                                                            ? "YES"
                                                                            : "NO"}
                                                                    </span>
                                                                </div>
                                                                {isMarketResolved && (
                                                                    <div
                                                                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                                                            position.type ===
                                                                            resolvedOutcome
                                                                                ? "bg-green-500/20 text-green-400"
                                                                                : "bg-red-500/20 text-red-400"
                                                                        }`}
                                                                    >
                                                                        {position.type ===
                                                                        resolvedOutcome
                                                                            ? "WON"
                                                                            : "LOST"}
                                                                    </div>
                                                                )}
                                                                <div className="text-sm text-gray-400">
                                                                    {new Date().toLocaleDateString()}
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-3 gap-4 text-sm mb-1">
                                                                <div>
                                                                    <div className="text-gray-500">
                                                                        Amount
                                                                    </div>
                                                                    <div className="font-medium">
                                                                        $
                                                                        {position.amount.toFixed(
                                                                            2
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-gray-500">
                                                                        Price
                                                                    </div>
                                                                    <div className="font-medium">
                                                                        $
                                                                        {position.price.toFixed(
                                                                            2
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-gray-500">
                                                                        Shares
                                                                    </div>
                                                                    <div className="font-medium">
                                                                        {position.quantity.toFixed(
                                                                            2
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-between items-center mt-3">
                                                                {isMarketResolved ? (
                                                                    position.type ===
                                                                    resolvedOutcome ? (
                                                                        <div className="text-green-400 font-medium">
                                                                            Won:
                                                                            $
                                                                            {(
                                                                                position.amount /
                                                                                position.price
                                                                            ).toFixed(
                                                                                2
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-red-400 font-medium">
                                                                            Lost:
                                                                            $
                                                                            {position.amount.toFixed(
                                                                                2
                                                                            )}
                                                                        </div>
                                                                    )
                                                                ) : (
                                                                    <>
                                                                        <div className="text-gray-500 text-sm">
                                                                            Potential
                                                                            profit:
                                                                        </div>
                                                                        <div className="text-green-400 font-medium">
                                                                            $
                                                                            {(
                                                                                position.amount /
                                                                                position.price
                                                                            ).toFixed(
                                                                                2
                                                                            )}
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Disable trading if market is resolved */}
                                    {!isMarketResolved ? (
                                        <>
                                            {/* Yes/No buttons */}
                                            {tradeTab === "buy" && (
                                                <div className="grid grid-cols-2 gap-3 mb-6">
                                                    <button
                                                        className={`rounded-md p-4 flex items-center justify-center font-medium ${
                                                            selectedPosition ===
                                                            "yes"
                                                                ? "bg-green-600 text-white"
                                                                : "bg-gray-700 hover:bg-gray-600"
                                                        }`}
                                                        onClick={() =>
                                                            handleSelectPosition(
                                                                "yes"
                                                            )
                                                        }
                                                    >
                                                        Yes $
                                                        {sharePrices.yesPriceUsd.toFixed(
                                                            2
                                                        )}
                                                    </button>
                                                    <button
                                                        className={`rounded-md p-4 flex items-center justify-center font-medium ${
                                                            selectedPosition ===
                                                            "no"
                                                                ? "bg-red-600 text-white"
                                                                : "bg-gray-700 hover:bg-gray-600"
                                                        }`}
                                                        onClick={() =>
                                                            handleSelectPosition(
                                                                "no"
                                                            )
                                                        }
                                                    >
                                                        No $
                                                        {sharePrices.noPriceUsd.toFixed(
                                                            2
                                                        )}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Amount input */}
                                            <div className="mb-4">
                                                <div className="flex justify-between mb-2">
                                                    <span className="text-gray-400">
                                                        Amount
                                                    </span>
                                                    <div className="relative">
                                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-2xl font-medium text-gray-500 pl-2">
                                                            $
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={betAmount}
                                                            onChange={(e) =>
                                                                setBetAmount(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            className="bg-transparent text-right text-4xl w-32 focus:outline-none"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Amount buttons */}
                                                <div className="grid grid-cols-4 gap-2 mb-6">
                                                    <button
                                                        className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                                                        onClick={() =>
                                                            setBetAmount("1")
                                                        }
                                                    >
                                                        +$1
                                                    </button>
                                                    <button
                                                        className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                                                        onClick={() =>
                                                            setBetAmount("20")
                                                        }
                                                    >
                                                        +$20
                                                    </button>
                                                    <button
                                                        className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                                                        onClick={() =>
                                                            setBetAmount("100")
                                                        }
                                                    >
                                                        +$100
                                                    </button>
                                                    <button
                                                        className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                                                        onClick={() =>
                                                            setBetAmount("max")
                                                        }
                                                    >
                                                        Max
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Buy/Sell Button */}
                                            {tradeTab === "buy" ? (
                                                <button
                                                    className={`w-full py-4 rounded-md font-medium ${
                                                        selectedPosition
                                                            ? "bg-blue-500 hover:bg-blue-600"
                                                            : "bg-gray-700 text-gray-400 cursor-not-allowed"
                                                    }`}
                                                    onClick={handleBuyPosition}
                                                    disabled={
                                                        !selectedPosition ||
                                                        txStatus === "pending"
                                                    }
                                                >
                                                    {txStatus === "pending" ? (
                                                        <div className="flex items-center justify-center">
                                                            <Loader2 className="animate-spin h-5 w-5 mr-2" />
                                                            Processing...
                                                        </div>
                                                    ) : selectedPosition ? (
                                                        `Buy ${
                                                            selectedPosition ===
                                                            "yes"
                                                                ? "Yes"
                                                                : "No"
                                                        }`
                                                    ) : (
                                                        "Select a position"
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    className="w-full bg-gray-700 hover:bg-gray-600 py-4 rounded-md font-medium"
                                                    disabled={
                                                        userPositions.length ===
                                                        0
                                                    }
                                                >
                                                    Sell Position
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center p-4 mb-4 border border-gray-700 rounded-lg">
                                            <p className="text-lg font-medium mb-2">
                                                Market Resolved
                                            </p>
                                            <p className="text-gray-400">
                                                This market has been resolved
                                                and trading is no longer
                                                available.
                                            </p>
                                        </div>
                                    )}

                                    {/* Transaction status */}
                                    {txStatus === "success" && txHash && (
                                        <div className="mt-4 text-sm text-center">
                                            <span className="text-green-500">
                                                Transaction successful!{" "}
                                            </span>
                                            <a
                                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 underline"
                                            >
                                                View on Etherscan
                                            </a>
                                        </div>
                                    )}
                                    {txStatus === "error" && txError && (
                                        <div className="mt-4 text-sm text-red-500 text-center">
                                            Error: {txError}
                                        </div>
                                    )}

                                    {/* Add this inside the user positions section, after the positions list */}
                                    {isMarketResolved && totalWinnings > 0 && (
                                        <div className="mt-6 p-4 bg-green-900/20 border border-green-500 rounded-lg">
                                            <div className="flex justify-between items-center mb-4">
                                                <div>
                                                    <h3 className="text-lg font-medium text-green-400">
                                                        Congratulations! 🎉
                                                    </h3>
                                                    <p className="text-sm text-green-300">
                                                        You have{" "}
                                                        {totalWinnings.toFixed(
                                                            2
                                                        )}{" "}
                                                        ETH in winnings to claim
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={
                                                        handleClaimWinnings
                                                    }
                                                    disabled={
                                                        isClaimingWinnings
                                                    }
                                                    className="bg-green-500 hover:bg-green-600"
                                                >
                                                    {isClaimingWinnings ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Claiming...
                                                        </>
                                                    ) : (
                                                        "Claim Winnings"
                                                    )}
                                                </Button>
                                            </div>
                                            {claimTxHash && (
                                                <div className="text-sm text-center">
                                                    <span className="text-green-400">
                                                        Winnings claimed
                                                        successfully!{" "}
                                                    </span>
                                                    <a
                                                        href={`https://sepolia.etherscan.io/tx/${claimTxHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 underline"
                                                    >
                                                        View on Etherscan
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Verification Result - Shown in both views */}
                        {result && (
                            <div className="relative">
                                <div
                                    className={`absolute -inset-0.5 rounded-lg blur opacity-30 ${
                                        color[result.decision]
                                    }`}
                                ></div>
                                <div className="relative bg-gray-900 rounded-lg p-6 shadow-xl">
                                    <div className="text-center mb-4">
                                        <h3 className="text-2xl font-bold">
                                            {result.decision.toUpperCase()}
                                        </h3>
                                        <div className="mt-2 flex justify-center">
                                            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-800">
                                                <div className="mr-2">
                                                    Confidence:
                                                </div>
                                                <div className="h-2 w-24 bg-gray-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${
                                                            bgColor[
                                                                result.decision
                                                            ]
                                                        }`}
                                                        style={{
                                                            width: `${result.confidence}%`,
                                                        }}
                                                    ></div>
                                                </div>
                                                <div className="ml-2 font-medium">
                                                    {result.confidence}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center mb-4">
                                        <div className="w-16 h-16 rounded-full flex items-center justify-center">
                                            {circle[result.decision]}
                                        </div>
                                    </div>

                                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                        <p className="text-gray-300 text-left">
                                            {result.reason}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Log Display - Shown in both views */}
                        {(isVerifying || logs.length > 0) && (
                            <div className="mb-6">
                                <h2 className="text-lg font-medium mb-2">
                                    Verification Process Logs
                                </h2>
                                <LogDisplay logs={logs} />
                            </div>
                        )}

                        {/* Admin View - Verification Panel */}
                        {activeView === "admin" && (
                            <div className="bg-gray-900 rounded-lg p-6 shadow-xl">
                                <div className="flex items-center mb-3">
                                    <span className="bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full mr-2">
                                        Admin Only
                                    </span>
                                    <h3 className="text-lg font-medium">
                                        Market Verification
                                    </h3>
                                </div>
                                <p className="text-gray-400 mb-6">
                                    Use AI verification to analyze this claim
                                    and determine its factual accuracy.
                                    Verification results will be visible to all
                                    market participants.
                                </p>

                                <Button
                                    onClick={handleVerify}
                                    disabled={
                                        isRequestingResolution || isVerifying
                                    }
                                    className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                                >
                                    {isRequestingResolution ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Requesting Resolution...
                                        </>
                                    ) : isVerifying ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying Claim...
                                        </>
                                    ) : (
                                        "Start Verification"
                                    )}
                                </Button>

                                {txStatus === "success" && txHash && (
                                    <div className="mt-4 text-sm text-center">
                                        <span className="text-green-500">
                                            Verification completed and resolved
                                            on-chain!{" "}
                                        </span>
                                        <a
                                            href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline"
                                        >
                                            View on Etherscan
                                        </a>
                                    </div>
                                )}
                                {txStatus === "error" && txError && (
                                    <div className="mt-4 text-sm text-red-500 text-center">
                                        Error: {txError}
                                    </div>
                                )}

                                {resolutionRequestTxHash && (
                                    <div className="mt-4 text-sm text-center">
                                        <span className="text-green-500">
                                            Resolution request submitted!{" "}
                                        </span>
                                        <a
                                            href={`https://sepolia.etherscan.io/tx/${resolutionRequestTxHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline"
                                        >
                                            View on Etherscan
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
