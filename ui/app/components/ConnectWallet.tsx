import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

declare global {
  interface Window {
    ethereum?: any
  }
}

interface ConnectWalletProps {
  onConnect: (address: string) => void
}

export default function ConnectWallet({ onConnect }: ConnectWalletProps) {
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState<boolean>(false)

  useEffect(() => {
    setIsMetaMaskInstalled(!!window.ethereum)
  }, [])

  const connectWallet = async () => {
    if (!window.ethereum) return

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })
      if (accounts[0]) {
        onConnect(accounts[0])
      }
    } catch (error) {
      console.error("Error connecting to MetaMask", error)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 p-8 rounded-xl border border-slate-800 max-w-md w-full mx-4"
      >
        <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
        <p className="text-slate-400 mb-6">
          {isMetaMaskInstalled
            ? "Please connect your MetaMask wallet to continue using TruthSeeker."
            : "Please install MetaMask to continue using TruthSeeker."}
        </p>
        {isMetaMaskInstalled ? (
          <Button
            onClick={connectWallet}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Connect MetaMask
          </Button>
        ) : (
          <Button
            onClick={() => window.open("https://metamask.io/download/", "_blank")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Install MetaMask
          </Button>
        )}
      </motion.div>
    </motion.div>
  )
} 