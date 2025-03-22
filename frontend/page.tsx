"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, CheckCircle, XCircle, CircleHelp, Clock, ChevronDown, Upload, X, ImageIcon, Calendar, ShieldCheck, Users } from "lucide-react"
import TruthOrb from "./truth-orb"
import axios from "axios"
import LogDisplay from './components/LogDisplay'

const API_URL = "http://localhost:3000/truthseeker/"
axios.defaults.baseURL = API_URL

const color = {
  true: "bg-green-400",
  false: "bg-red-400",
  depends: "bg-yellow-400",
  inconclusive: "bg-gray-400",
  too_early: "bg-blue-400",
}

const bgColor = {
  true: "bg-green-500",
  false: "bg-red-500",
  depends: "bg-yellow-500",
  inconclusive: "bg-gray-500",
  too_early: "bg-blue-500",
}

const circle = {
  true: <CheckCircle className="h-12 w-12 text-green-500" />,
  false: <XCircle className="h-12 w-12 text-red-500" />,
  depends: <CheckCircle className="h-12 w-12 text-yellow-500" />,
  inconclusive: <CircleHelp className="h-12 w-12 text-gray-500" />,
  too_early: <Clock className="h-12 w-12 text-blue-500" />,
}

// Helper to format date for display
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
};

// Get default expiry date (30 days from now)
const getDefaultExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
};

export default function ClaimVerifier() {
  const [claimInput, setClaimInput] = useState("")
  const [claimDetails, setClaimDetails] = useState("")
  const [claimImage, setClaimImage] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState(getDefaultExpiryDate())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [claim, setClaim] = useState("")
  const [details, setDetails] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [expiry, setExpiry] = useState("")

  const [showDashboard, setShowDashboard] = useState(false)
  const [activeView, setActiveView] = useState<'user' | 'admin'>('user')
  const [isVerifying, setIsVerifying] = useState(false)
  const [result, setResult] = useState<null | {
    decision: "true" | "false" | "depends" | "inconclusive" | "too_early"
    confidence: number
    reason: string
  }>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [yesVotes, setYesVotes] = useState(0)
  const [noVotes, setNoVotes] = useState(0)
  const [totalVotes, setTotalVotes] = useState(0)
  const [betAmount, setBetAmount] = useState("1")
  const [activeTab, setActiveTab] = useState("all")

  // Add state for user positions
  const [userPositions, setUserPositions] = useState<{
    type: 'yes' | 'no',
    amount: number,
    price: number,
    quantity: number
  }[]>([])

  // Track active trade tab
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy')

  // Add state for selected position
  const [selectedPosition, setSelectedPosition] = useState<'yes' | 'no' | null>(null)

  // Calculate probabilities and prices
  const yesProbability = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 50
  const noProbability = totalVotes > 0 ? 100 - yesProbability : 50
  const yesPrice = (yesProbability / 100).toFixed(2)
  const noPrice = (noProbability / 100).toFixed(2)

  // Calculate potential winnings based on selected position
  const calculatePotentialWin = () => {
    if (!selectedPosition) return "0.00"
    const price = selectedPosition === 'yes' ? Number(yesPrice) : Number(noPrice)
    return (Number(betAmount) / price).toFixed(2)
  }

  const potentialWin = calculatePotentialWin()

  useEffect(() => {
    setTotalVotes(yesVotes + noVotes)
  }, [yesVotes, noVotes])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setClaimImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setClaimImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCreateMarket = () => {
    if (!claimInput.trim()) return

    setClaim(claimInput.trim())
    setDetails(claimDetails)
    setImage(claimImage)
    setExpiry(expiryDate)
    setShowDashboard(true)
  }

  const handleVerify = async () => {
    if (!claim.trim()) return

    setIsVerifying(true)
    setLogs([])
    setResult(null)

    try {
      // Start verification
      const aggregator = await verifyClaimWithProgress(claim, setLogs);

      setResult({
        decision: aggregator.decision,
        confidence: aggregator.confidence,
        reason: aggregator.reason,
      });
    } catch (e: any) {
      console.error('Error verifying claim:', e);
      setLogs(prev => [...prev, `[error] Error verifying claim: ${e.message}`]);
    } finally {
      setIsVerifying(false);
    }
  };

  // Function to handle incremental updates
  const verifyClaimWithProgress = async (
    claim: string,
    setLogsFunction?: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    // Create a controller to abort the fetch if needed
    const controller = new AbortController();
    const { signal } = controller;

    try {
      // Make the initial request to start the verification
      const response = await axios.post("verify-claim-frontend", { claim });
      const verificationId = response.data.verificationId;

      // Poll for updates
      let completed = false;
      let result = null;

      while (!completed) {
        // Wait a short time between polls
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get the latest status
        const statusResponse = await axios.get(`verify-claim-frontend-status/${verificationId}`, { signal });
        const status = statusResponse.data;

        // Add any new logs
        if (status.logs && status.logs.length > 0 && setLogsFunction) {
          setLogsFunction(prev => [...prev, ...status.logs]);
        }

        // Check if completed
        if (status.completed) {
          completed = true;
          result = status.result;
        }
      }

      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        throw error;
      }
    } finally {
      controller.abort(); // Clean up
    }
  };

  // Handle position selection
  const handleSelectPosition = (position: 'yes' | 'no') => {
    setSelectedPosition(position)
  }

  // Handle the actual purchase
  const handleBuyPosition = () => {
    if (!selectedPosition) return

    // Update vote counts
    if (selectedPosition === 'yes') {
      setYesVotes(prev => prev + 1)
    } else {
      setNoVotes(prev => prev + 1)
    }

    // Calculate price and quantity
    const price = selectedPosition === 'yes' ? Number(yesPrice) : Number(noPrice)
    const quantity = Math.floor(Number(betAmount) / price * 100) // Convert to shares (cents)

    // Add to positions
    setUserPositions(prev => [
      ...prev,
      {
        type: selectedPosition,
        amount: Number(betAmount),
        price,
        quantity
      }
    ])

    // Reset bet amount and selected position
    setBetAmount("1")
    setSelectedPosition(null)
  }

  // Calculate total position value
  const calculateTotalPosition = () => {
    if (userPositions.length === 0) return { total: 0, potential: 0, type: null }

    const yesPositions = userPositions.filter(p => p.type === 'yes')
    const noPositions = userPositions.filter(p => p.type === 'no')

    const yesAmount = yesPositions.reduce((sum, p) => sum + p.amount, 0)
    const noAmount = noPositions.reduce((sum, p) => sum + p.amount, 0)

    let type: 'yes' | 'no' | null = null
    let total = 0
    let potential = 0

    if (yesAmount > noAmount) {
      type = 'yes'
      total = yesAmount - noAmount
      // Calculate potential winnings using current probability
      potential = total / Number(yesPrice)
    } else if (noAmount > yesAmount) {
      type = 'no'
      total = noAmount - yesAmount
      potential = total / Number(noPrice)
    } else {
      type = null
      total = 0
      potential = 0
    }

    return { total, potential, type }
  }

  const position = calculateTotalPosition()

  // Handle direct amount input
  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Extract numeric value
    const value = e.target.value.replace(/[^0-9.]/g, '')

    // Handle decimal points properly (only one allowed)
    if (value.split('.').length > 2) {
      return
    }

    // Limit to 2 decimal places and valid amount
    const parts = value.split('.')
    if (parts.length > 1 && parts[1].length > 2) {
      return
    }

    // Update amount
    setBetAmount(value)
  }

  // Handle amount button clicks
  const handleAmountChange = (amount: string) => {
    // For "Max", we'd normally calculate based on user balance, but for now just set a reasonable max
    if (amount === "max") {
      setBetAmount("14.00")
      return
    }

    // Otherwise add the amount to the current bet
    const currentAmount = Number(betAmount) || 0
    const newAmount = (currentAmount + Number(amount)).toFixed(2)
    setBetAmount(newAmount)
  }

  // Mock data for chart
  const generateMockChartData = () => {
    const data = [];
    let value = 50;
    for (let i = 0; i < 100; i++) {
      value += Math.random() * 10 - 5;
      value = Math.max(10, Math.min(90, value));
      data.push(value);
    }
    return data;
  };

  const chartData = generateMockChartData();

  // Chart height calculation
  const getHeight = (value: number, max: number = 100) => {
    return (value / max) * 100;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#1A202C] text-white">
      {/* Header with navigation */}
      <header className="border-b border-gray-800 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <TruthOrb className="h-8 w-8" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
              Prediction Market
            </h1>
          </div>

          {showDashboard && (
            <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeView === 'user' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveView('user')}
              >
                <Users className="h-4 w-4 inline mr-1" />
                User View
              </button>
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeView === 'admin' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setActiveView('admin')}
              >
                <ShieldCheck className="h-4 w-4 inline mr-1" />
                Admin View
              </button>
            </div>
          )}

          <div className="flex space-x-1">
            <div className="text-green-400">$0.00</div>
            <div className="text-green-400 mr-2">$0.00</div>
            <Button variant="default" className="bg-blue-500 hover:bg-blue-600">Deposit</Button>
          </div>
        </div>
      </header>

      {/* Categories navbar */}
      <div className="bg-[#1A202C] border-b border-gray-800 px-4">
        <div className="container mx-auto">
          <div className="flex space-x-6 overflow-x-auto text-sm py-2">
            <div className="text-red-500 font-medium">LIVE</div>
            <div className="text-gray-300">All</div>
            <div className="text-gray-300">Politics</div>
            <div className="text-gray-300">Sports</div>
            <div className="text-gray-300">Crypto</div>
            <div className="text-gray-300">Global Events</div>
            <div className="text-gray-300">Tech</div>
            <div className="text-gray-300">Verified Claims</div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Claim Input Section */}
          {!showDashboard && (
            <div className="bg-gray-900 rounded-lg p-6 shadow-xl mb-8">
              <h2 className="text-xl font-bold mb-4">Create a New Market</h2>
              <div className="space-y-6">
                {/* Claim Title */}
                <div>
                  <label htmlFor="claim" className="block text-sm font-medium text-gray-400 mb-2">
                    Claim Title
                    </label>
                    <Input
                      id="claim"
                    value={claimInput}
                    onChange={(e) => setClaimInput(e.target.value)}
                      placeholder="e.g., 'The Earth is flat'"
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>

                {/* Claim Details */}
                <div>
                  <label htmlFor="details" className="block text-sm font-medium text-gray-400 mb-2">
                    Claim Details
                  </label>
                  <Textarea
                    id="details"
                    value={claimDetails}
                    onChange={(e) => setClaimDetails(e.target.value)}
                    placeholder="Provide additional context or details about this claim..."
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:ring-cyan-500 focus:border-cyan-500 min-h-[100px]"
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label htmlFor="expiry" className="block text-sm font-medium text-gray-400 mb-2">
                    Resolution Date
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Calendar className="h-5 w-5 text-gray-500" />
                    </div>
                    <Input
                      id="expiry"
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="bg-gray-800 border-gray-700 text-white pl-10 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    The date when this market will be resolved and winners paid out
                  </p>
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Add Image (Optional)
                  </label>

                  {claimImage ? (
                    <div className="relative">
                      <img
                        src={claimImage}
                        alt="Claim Preview"
                        className="mt-2 rounded-md w-full max-h-[300px] object-contain border border-gray-700"
                      />
                      <button
                        className="absolute top-2 right-2 bg-gray-800 rounded-full p-1 hover:bg-gray-700"
                        onClick={handleRemoveImage}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-gray-600 rounded-md p-6 text-center cursor-pointer hover:border-gray-500 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="h-10 w-10 mx-auto text-gray-500 mb-2" />
                      <p className="text-sm text-gray-400">Click to upload an image</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>

                  <Button
                  onClick={handleCreateMarket}
                  disabled={!claimInput.trim()}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                >
                  Create Market
                </Button>
              </div>
            </div>
          )}

          {/* Market Display */}
          {showDashboard && (
            <div className="space-y-8">
              {/* Market Header */}
              <div className="bg-gray-900 rounded-lg p-6 shadow-xl">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Left column with image */}
                  {image && (
                    <div className="md:w-1/3">
                      <img
                        src={image}
                        alt="Claim illustration"
                        className="rounded-lg w-full h-auto object-cover border border-gray-700"
                      />
                    </div>
                  )}

                  {/* Right column with claim info */}
                  <div className={image ? "md:w-2/3" : "w-full"}>
                    <div className="flex items-start mb-4">
                      {result ? (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                          {circle[result.decision]}
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                          <CircleHelp className="h-8 w-8 text-gray-600" />
                        </div>
                      )}
                      <h2 className="text-2xl font-bold">{claim}</h2>
                    </div>

                    {details && (
                      <div className="mb-4 bg-gray-800 p-4 rounded-md border border-gray-700">
                        <p className="text-gray-300 whitespace-pre-line">{details}</p>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
                      <div>Volume: ${(totalVotes * 10).toLocaleString()}</div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        Expires: {expiry ? formatDate(expiry) : "Mar 31, 2025"}
                      </div>
                    </div>

                    <div className="flex items-center mb-6">
                      <div className="mr-2 text-lg font-bold">
                        <span className="text-blue-400">{yesProbability}% chance</span>
                      </div>
                      <div className={`text-sm ${totalVotes === 0 ? 'text-gray-500' : yesProbability > 50 ? 'text-green-500' : 'text-red-500'}`}>
                        {totalVotes === 0 ? '0%' : yesProbability > 50 ? `↑${yesProbability - 50}%` : `↓${50 - yesProbability}%`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div className="relative h-40 mb-6">
                  <div className="absolute top-0 right-0 text-sm text-gray-500">90%</div>
                  <div className="absolute top-1/2 right-0 transform -translate-y-1/2 text-sm text-gray-500">50%</div>
                  <div className="absolute bottom-0 right-0 text-sm text-gray-500">10%</div>

                  <div className="h-full w-full flex items-end">
                    {chartData.map((value, index) => (
                      <div
                        key={index}
                        className="w-full h-full flex items-end"
                        style={{ width: `${100 / chartData.length}%` }}
                      >
                        <div
                          className="w-full bg-blue-500"
                          style={{ height: `${getHeight(value)}%` }}
                        ></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Time period tabs */}
                <div className="flex text-sm mb-6">
                  <button
                    className={`px-2 py-1 ${activeTab === '1h' ? 'text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('1h')}
                  >
                    1H
                  </button>
                  <button
                    className={`px-2 py-1 ${activeTab === '6h' ? 'text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('6h')}
                  >
                    6H
                  </button>
                  <button
                    className={`px-2 py-1 ${activeTab === '1d' ? 'text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('1d')}
                  >
                    1D
                  </button>
                  <button
                    className={`px-2 py-1 ${activeTab === '1w' ? 'text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('1w')}
                  >
                    1W
                  </button>
                  <button
                    className={`px-2 py-1 ${activeTab === '1m' ? 'text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('1m')}
                  >
                    1M
                  </button>
                  <button
                    className={`px-2 py-1 ${activeTab === 'all' ? 'bg-gray-800 rounded-full text-white' : 'text-gray-500'}`}
                    onClick={() => setActiveTab('all')}
                  >
                    ALL
                  </button>
                </div>

                {/* Order Book header */}
                <div className="flex justify-between items-center text-lg font-medium mb-4">
                  <div>Order Book</div>
                  <button className="text-gray-500">
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Trading Panel */}
              {activeView === 'user' && (
                <div className="bg-gray-900 rounded-lg shadow-xl">
                  <div className="border-b border-gray-800 px-6 py-4">
                    <div className="flex space-x-2">
                      <button
                        className={`text-lg font-medium pb-2 ${tradeTab === 'buy' ? 'border-b-2 border-white' : 'text-gray-500'}`}
                        onClick={() => setTradeTab('buy')}
                      >
                        Buy
                      </button>
                      <button
                        className={`text-lg font-medium pb-2 ${tradeTab === 'sell' ? 'border-b-2 border-white' : 'text-gray-500'}`}
                        onClick={() => setTradeTab('sell')}
                      >
                        Sell
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {/* User Position - shown when they have a position */}
                    {userPositions.length > 0 && (
                      <div className="mb-6 border border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-gray-400">Your Position</div>
                          <div className={position.type === 'yes' ? 'text-green-400' : 'text-orange-400'}>
                            {position.type === 'yes' ? 'YES' : 'NO'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-2">
                          <div>
                            <div className="text-gray-500 text-sm">Amount</div>
                            <div className="text-white font-medium">${position.total.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 text-sm">Potential Profit</div>
                            <div className="text-green-400 font-medium">${position.potential.toFixed(2)}</div>
                          </div>
                        </div>

                        <div className="text-xs text-gray-500">
                          Qty: {userPositions.reduce((sum, p) => sum + p.quantity, 0)} shares
                        </div>
                      </div>
                    )}

                    {/* Yes/No buttons - Now they just highlight selection, not make purchase */}
                    {tradeTab === 'buy' && (
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <button
                          className={`rounded-md p-4 flex items-center justify-center font-medium ${
                            selectedPosition === 'yes'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                          onClick={() => handleSelectPosition('yes')}
                        >
                          Yes {yesPrice}¢
                        </button>
                        <button
                          className={`rounded-md p-4 flex items-center justify-center font-medium ${
                            selectedPosition === 'no'
                              ? 'bg-slate-600 text-white'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                          onClick={() => handleSelectPosition('no')}
                        >
                          No {noPrice}¢
                        </button>
                      </div>
                    )}

                    {/* Sell buttons - if in Sell tab and has positions */}
                    {tradeTab === 'sell' && userPositions.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <button
                          className="bg-gray-700 hover:bg-gray-600 rounded-md p-4 flex items-center justify-center font-medium"
                          disabled={!userPositions.some(p => p.type === 'yes')}
                        >
                          Sell Yes
                        </button>
                        <button
                          className="bg-gray-700 hover:bg-gray-600 rounded-md p-4 flex items-center justify-center font-medium"
                          disabled={!userPositions.some(p => p.type === 'no')}
                        >
                          Sell No
                        </button>
                      </div>
                    )}

                    {/* Amount - updated to allow direct input */}
                    <div className="mb-4">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400">Amount</span>
                        <div className="relative">
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-2xl font-medium text-gray-500 pl-2">$</span>
                          <input
                            type="text"
                            value={betAmount}
                            onChange={handleAmountInputChange}
                            className="bg-transparent text-right text-4xl w-32 focus:outline-none"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 mb-4">Balance $14.00</div>

                      {/* Amount buttons */}
                      <div className="grid grid-cols-4 gap-2 mb-6">
                        <button
                          className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                          onClick={() => handleAmountChange("1")}
                        >
                          +$1
                        </button>
                        <button
                          className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                          onClick={() => handleAmountChange("20")}
                        >
                          +$20
                        </button>
                        <button
                          className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                          onClick={() => handleAmountChange("100")}
                        >
                          +$100
                        </button>
                        <button
                          className="bg-gray-800 hover:bg-gray-700 rounded-md py-2 text-sm"
                          onClick={() => handleAmountChange("max")}
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    {/* To win - Only shown when a position is selected */}
                    {tradeTab === 'buy' && selectedPosition && (
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <div className="flex items-center">
                            <span className="text-lg">To win</span>
                            <span className="text-green-400 ml-1">💰</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            Avg. Price {selectedPosition === 'yes' ? yesPrice : noPrice}¢
                          </div>
                        </div>
                        <div className="text-green-400 text-4xl font-medium">${potentialWin}</div>
                      </div>
                    )}

                    {/* Buy Button - Now shows the selected position */}
                    {tradeTab === 'buy' ? (
                      <button
                        className={`w-full py-4 rounded-md font-medium ${
                          selectedPosition
                            ? 'bg-blue-500 hover:bg-blue-600'
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                        onClick={handleBuyPosition}
                        disabled={!selectedPosition}
                      >
                        {selectedPosition
                          ? `Buy ${selectedPosition === 'yes' ? 'Yes' : 'No'}`
                          : 'Select a position'
                        }
                      </button>
                    ) : (
                      <button
                        className="w-full bg-gray-700 hover:bg-gray-600 py-4 rounded-md font-medium"
                        disabled={userPositions.length === 0}
                      >
                        Sell Position
                      </button>
                    )}

                    <div className="text-center text-sm text-gray-500 mt-4">
                      By trading, you agree to the Terms of Use.
                    </div>
                  </div>
                </div>
              )}

              {/* Admin View - Verification Panel */}
              {activeView === 'admin' && (
                <div className="bg-gray-900 rounded-lg p-6 shadow-xl">
                  <div className="flex items-center mb-3">
                    <span className="bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full mr-2">
                      Admin Only
                    </span>
                    <h3 className="text-lg font-medium">Market Verification</h3>
                  </div>
                  <p className="text-gray-400 mb-6">
                    Use AI verification to analyze this claim and determine its factual accuracy.
                    Verification results will be visible to all market participants.
                  </p>

                  <Button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Start Verification"
                    )}
                  </Button>
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
                      <h3 className="text-2xl font-bold">{result.decision.toUpperCase()}</h3>
                      <div className="mt-2 flex justify-center">
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-800">
                          <div className="mr-2">Confidence:</div>
                          <div className="h-2 w-24 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${bgColor[result.decision]}`}
                              style={{ width: `${result.confidence}%` }}
                            ></div>
                          </div>
                          <div className="ml-2 font-medium">{result.confidence}%</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-center mb-4">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center">
                        {circle[result.decision]}
                      </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <p className="text-gray-300 text-left">{result.reason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Log Display - Shown in both views */}
              {(isVerifying || logs.length > 0) && (
                <div className="mb-6">
                  <h2 className="text-lg font-medium mb-2">Verification Process Logs</h2>
                  <LogDisplay logs={logs} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="py-6 border-t border-gray-800">
        <div className="container mx-auto text-center text-gray-500 text-sm">
          <p>Prediction Market © {new Date().getFullYear()} • Claim Verification System</p>
        </div>
      </footer>
    </div>
  )
}
