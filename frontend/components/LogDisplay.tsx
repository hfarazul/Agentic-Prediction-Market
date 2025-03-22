"use client"

import React, { useEffect } from "react"
import { ChevronRight } from "lucide-react"

interface LogDisplayProps {
  logs: string[]
  autoScroll?: boolean
  showLineNumbers?: boolean
}

export default function LogDisplay({ logs = [], autoScroll = true, showLineNumbers = true }: LogDisplayProps) {
  const logEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (autoScroll && logEndRef.current && logs.length > 0 && !logs[logs.length - 1].endsWith("Claim verification completed successfully")) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [autoScroll, logs])

  const getLogColor = (log: string) => {
    if (log.startsWith("[blue]")) {
      return "text-blue-400"
    } else if (log.startsWith("[red]")) {
      return "text-red-400"
    } else if (log.startsWith("[final]")) {
      return "text-yellow-400"
    }
    return "text-gray-300"
  }

  const formatLog = (log: string) => {
    // Remove the prefix for display
    if (log.startsWith("[blue]") || log.startsWith("[red]") || log.startsWith("[final]")) {
      return log.substring(log.indexOf("]") + 1).trim()
    }
    return log
  }

  return (
    <div className="w-full border border-gray-800 rounded-md bg-gray-950 shadow-md">
      <div
        className="p-4 h-80 overflow-y-auto font-mono text-sm"
        style={{
          display: "grid",
          gridTemplateColumns: showLineNumbers ? "2.5rem 1rem 1fr" : "1rem 1fr",
          gap: "0.25rem 0.5rem",
        }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 italic col-span-full">No logs to display</div>
        ) : (
          logs.map((log, index) => (
            <React.Fragment key={index}>
              {showLineNumbers && <div className="text-gray-600 text-right select-none">{index + 1}</div>}
              <div className="flex items-start">
                <ChevronRight className="h-4 w-4 text-gray-600 mt-0.5" />
              </div>
              <div className={`${getLogColor(log)} break-words`}>{formatLog(log)}</div>
            </React.Fragment>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
