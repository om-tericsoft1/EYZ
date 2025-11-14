"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface VoiceVisualizerProps {
  isActive: boolean
  label?: string
}

export function VoiceVisualizer({ isActive, label = "Listening..." }: VoiceVisualizerProps) {
  const [bars, setBars] = useState<number[]>(Array(8).fill(0))

  useEffect(() => {
    if (!isActive) {
      setBars(Array(8).fill(0))
      return
    }

    const interval = setInterval(() => {
      setBars((prev) => prev.map(() => Math.random() * 100))
    }, 100)

    return () => clearInterval(interval)
  }, [isActive])

  return (
    <div className="flex items-center justify-center space-x-1 py-2">
      <span className="text-sm text-muted-foreground mr-3">{label}</span>
      {bars.map((height, index) => (
        <div
          key={index}
          className={cn(
            "w-1 bg-primary rounded-full transition-all duration-100 voice-wave",
            isActive ? "opacity-100" : "opacity-30",
          )}
          style={{
            height: `${Math.max(4, height * 0.3)}px`,
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}