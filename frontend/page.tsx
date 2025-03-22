"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle, XCircle, CircleHelp, Clock } from "lucide-react"
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

export default function ClaimVerifier() {
  const [claim, setClaim] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [result, setResult] = useState<null | {
    decision: "true" | "false" | "depends" | "inconclusive" | "too_early"
    confidence: number
    reason: string
  }>(null)
  const [logs, setLogs] = useState<string[]>([])

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

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl space-y-12">
          <header className="text-center space-y-4">
            <TruthOrb />
            <h1 className="text-4xl sm:text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
              TruthSeeker
            </h1>
            <p className="text-gray-400 text-lg sm:text-xl">Advanced Claim Verification System</p>
          </header>

          <div className="space-y-8">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-gray-900 rounded-lg p-6 shadow-xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="claim" className="text-sm text-gray-400">
                      Enter claim to verify
                    </label>
                    <Input
                      id="claim"
                      value={claim}
                      onChange={(e) => setClaim(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleVerify()
                        }
                      }}
                      placeholder="e.g., 'The Earth is flat'"
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                  </div>

                  <Button
                    onClick={handleVerify}
                    disabled={!claim.trim() || isVerifying}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-lg shadow-cyan-500/20"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying the claim...
                      </>
                    ) : (
                      "Verify Claim"
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {result && (
              <div className="relative">
                <div
                  className={`absolute -inset-0.5 rounded-lg blur opacity-40 ${
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

            {/* Log Display */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Verification Process Logs</h2>
              <LogDisplay logs={logs} />
            </div>
          </div>
        </div>
      </div>

      <footer className="py-6 border-t border-gray-800">
        <div className="container mx-auto text-center text-gray-500 text-sm">
          <p>TruthSeeker © {new Date().getFullYear()} • Claim Verification System</p>
        </div>
      </footer>
    </div>
  )
}
