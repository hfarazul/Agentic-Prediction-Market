"use client"

import type React from "react"
import type { ReactNode } from "react"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, X, Scale, HelpCircle, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import BackgroundAnimation from "@/components/background-animation"
import ConnectWallet from "./components/ConnectWallet"
import TaskRegistryJson from "./TaskRegistry.json"
import { Contract, BrowserProvider, Signer, parseEther, toBigInt } from "ethers"

const TASK_REGISTRY = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
const TASK_REGISTRY_ABI = TaskRegistryJson.abi

type Resolution = "true" | "false" | "depends" | "inconclusive" | "too_early" | "loading"

function idToResolution(id: string): Resolution {
  switch (id) {
    case "0":
      return "loading"
    case "1":
      return "true"
    case "2":
      return "false"
    case "3":
      return "depends"
    case "4":
      return "inconclusive"
    case "5":
      return "too_early"
    default:
      return "loading"
  }
}

interface Claim {
  id: string
  text: string
  status: Resolution
  txHash: string
}

export default function Home() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [currentClaim, setCurrentClaim] = useState("")
  const [isLoadingPastClaims, setIsLoadingPastClaims] = useState(true)
  const [signer, setSigner] = useState<Signer | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [taskRegistryContract, setTaskRegistryContract] = useState<Contract | null>(null)

  useEffect(() => {
    // Check if user is already connected
    const checkConnection = async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" })
          if (accounts[0]) {
            const provider = new BrowserProvider(window.ethereum)
            const signer = await provider.getSigner(accounts[0])
            setSigner(signer)
          }

          window.ethereum.on('accountsChanged', async (accounts: string[]) => {
            const provider = new BrowserProvider(window.ethereum)
            const signer = await provider.getSigner(accounts[0])
            setSigner(signer)
          })
        } catch (error) {
          console.error("Error checking wallet connection:", error)
        }
      }
    }

    checkConnection()
  }, [])

  useEffect(() => {
    if (!signer) return
    setClaims([])
  
    signer.getAddress().then(async (address) => {
      if (address == walletAddress) return;
      setWalletAddress(address)
      taskRegistryContract?.removeAllListeners()

      const contract = new Contract(TASK_REGISTRY, TASK_REGISTRY_ABI, signer)
      setTaskRegistryContract(contract)

      // get current block number
      const currentBlock = await window.ethereum.request({ method: "eth_blockNumber" })

      // Simulate API call or database query
      const filterClaims = contract.filters.TaskSubmitted(null, address, null, null)
      const claims = await contract.queryFilter(filterClaims, Math.max(0, currentBlock - 1000), "latest") as any[]

      const filterResults = contract.filters.TaskUpdated(null, address, null, null)
      const results = await contract.queryFilter(filterResults, Math.max(0, currentBlock - 1000), "latest") as any[]
      claims.forEach((claim) => {
        const status = idToResolution(
          (results.find((result) => result.args[0].toString() === claim.args[0].toString())?.args[3] || "0").toString()
        );
  
        if (status == "loading") {
          const filterResolution = contract.filters.TaskUpdated(claim.args[0].toString(), address, null, null)
          contract.once(filterResolution, event => {
            const status = idToResolution(event.args[3].toString())
            setClaims((prev) => prev.map(c => c.id === claim.args[0].toString() ? { ...c, status } : c))
          })
        }

        setClaims((prev) => [{
          id: claim.args[0].toString(),
          text: claim.args[3],
          txHash: claim.transactionHash,
          status,
        }, ...prev])
      })
      setIsLoadingPastClaims(false)
    });
  }, [signer])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const claimText = currentClaim.trim()
    if (!claimText) return

    taskRegistryContract?.submitTask(claimText, { value: parseEther("0.0001") }).then((tx) => {
      setCurrentClaim("")
      const claim: Claim = {
        id: Date.now().toString(),
        text: claimText,
        status: "loading",
        txHash: tx.hash
      };
      setClaims((prev) => [claim, ...prev]);

      tx.wait().then((receipt: any) => {
        claim.id = receipt.logs[0].args[0].toString();
        const filterResolution = taskRegistryContract?.filters.TaskUpdated(claim.id, walletAddress, null, null)
        taskRegistryContract?.once(filterResolution, event => {
          const status = idToResolution(event.args[3].toString())
          setClaims((prev) => prev.map(c => c.id === claim.id ? { ...c, status } : c))
        })
      })
    });
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white overflow-hidden">
      {!walletAddress && <ConnectWallet onConnect={setWalletAddress} />}
      <BackgroundAnimation />

      <div className="container mx-auto px-4 py-8 relative z-10">
        <header className="text-center mb-12">
          <motion.h1
            className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            TruthSeeker
          </motion.h1>
          <motion.p
            className="text-blue-300 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            AI-Powered Claim Verification
          </motion.p>
        </header>

        <motion.div
          className="max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Enter a claim to verify..."
                value={currentClaim}
                onChange={(e) => setCurrentClaim(e.target.value)}
                className="bg-slate-900 border-blue-500 text-white h-14 pl-4 pr-4 rounded-lg focus:ring-blue-400 focus:border-blue-400"
              />
            </div>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-all duration-200 ease-in-out"
            >
              Verify Claim
            </Button>
          </form>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold mb-4 text-blue-300">Verification Results</h2>

          {isLoadingPastClaims ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
              <p className="text-slate-400 mt-2">Loading past verifications...</p>
            </div>
          ) : claims.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              No claims submitted yet. Enter a claim above to get started.
            </p>
          ) : (
            <ul className="space-y-4">
              {claims.map((claim) => (
                <motion.li
                  key={claim.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  className="bg-slate-900 p-4 rounded-lg border border-slate-800 flex items-center gap-4"
                >
                  <div className="flex-shrink-0">
                    <StatusIcon status={claim.status} />
                  </div>
                  <div className="flex-grow">
                    <p className="text-slate-200">{claim.text}</p>
                    <p className="text-sm text-slate-400 mt-1">
                      {claim.status == "loading" ? "TxHash:" : "Result:"} {" "}
                      <span className={`font-medium ${getStatusColor(claim.status)}`}>
                        {formatStatus(claim)}
                      </span>
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: Resolution }) {
  switch (status) {
    case "loading":
      return <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
    case "true":
      return <Check className="h-6 w-6 text-green-500" />
    case "false":
      return <X className="h-6 w-6 text-red-500" />
    case "depends":
      return <Scale className="h-6 w-6 text-yellow-500" />
    case "inconclusive":
      return <HelpCircle className="h-6 w-6 text-purple-500" />
    case "too_early":
      return <Clock className="h-6 w-6 text-orange-500" />
    default:
      return null
  }
}

function formatStatus(claim: Claim): string {
  if (claim.status === "loading") return claim.txHash
  return claim.status.charAt(0).toUpperCase() + claim.status.slice(1).replace("_", " ")
}

function getStatusColor(status: Resolution): string {
  switch (status) {
    case "loading":
      return "text-blue-400"
    case "true":
      return "text-green-500"
    case "false":
      return "text-red-500"
    case "depends":
      return "text-yellow-500"
    case "inconclusive":
      return "text-purple-500"
    case "too_early":
      return "text-orange-500"
    default:
      return "text-slate-400"
  }
}
