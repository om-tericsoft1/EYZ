"use client"

import { useEffect, useRef, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { getWsBaseUrl } from "@/lib/api-config"

interface ChunkInfo {
  filename: string
  size: number
  created: string
}

export function useChunkMonitor() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMonitoringRef = useRef(false)
  const isConnectingRef = useRef(false)

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (isConnectingRef.current) {
      console.log("Connection attempt already in progress")
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected")
      return
    }

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      try {
        wsRef.current.close()
      } catch (e) {
        console.warn("Error closing existing connection:", e)
      }
      wsRef.current = null
    }

    isConnectingRef.current = true

    try {
      const wsUrl = `${getWsBaseUrl()}/ws/chunks`
      console.log("🔌 Connecting to WebSocket:", wsUrl)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log("✅ WebSocket connected")
        isConnectingRef.current = false
        
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping")
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          if (message.type === "new_chunk" && message.data) {
            const chunk: ChunkInfo = message.data
            const createdDate = new Date(chunk.created)
            const timeStr = createdDate.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit'
            })

            console.log("📹 New chunk received:", chunk.filename)

            toast({
              title: "AI Ready to Process ",
              description: `Recorded at ${timeStr} • ${(chunk.size / (1024 * 1024)).toFixed(1)} MB`,
              duration: 5000,
            })
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
        isConnectingRef.current = false
      }

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason || '(no reason)'}`)
        isConnectingRef.current = false
        cleanup()
        wsRef.current = null
        
        if (isMonitoringRef.current) {
          console.log("🔄 Reconnecting in 3 seconds...")
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, 3000)
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error("Failed to create WebSocket:", error)
      isConnectingRef.current = false
    }
  }, [cleanup])

  const startMonitoring = useCallback(() => {
    if (isMonitoringRef.current) {
      console.log("Already monitoring")
      return () => {}
    }

    isMonitoringRef.current = true
    console.log("🚀 Starting WebSocket monitoring...")
    
    const initTimeout = setTimeout(() => {
      connect()
    }, 100)

    return () => {
      clearTimeout(initTimeout)
      isMonitoringRef.current = false
      cleanup()
      
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch (e) {
          console.warn("Error closing WebSocket:", e)
        }
        wsRef.current = null
      }
      console.log("🛑 Monitoring stopped")
    }
  }, [connect, cleanup])

  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false
    cleanup()
    
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (e) {
        console.warn("Error closing WebSocket:", e)
      }
      wsRef.current = null
    }
    console.log("🛑 Monitoring stopped and connection closed")
  }, [cleanup])

  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  return { startMonitoring, stopMonitoring }
}