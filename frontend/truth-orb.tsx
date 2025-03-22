import React from "react"

interface TruthOrbProps {
  className?: string
}

const TruthOrb: React.FC<TruthOrbProps> = ({ className }) => {
  return (
    <div className={`relative ${className || 'w-16 h-16'}`}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 opacity-70 blur-sm"></div>
      <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-300 to-blue-500"></div>
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-black to-gray-800"></div>
      <div className="absolute inset-0 rounded-full flex items-center justify-center">
        <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-br from-cyan-200 to-blue-400 opacity-80"></div>
      </div>
    </div>
  )
}

export default TruthOrb

