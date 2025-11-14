"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import ChatInterface from "@/components/chat-interface"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Circle } from "lucide-react"
import { getApiBaseUrl } from "@/lib/api-config"
const API_BASE_URL = getApiBaseUrl()

export default function ChatPage() {
  const router = useRouter()
  const [selectedVideo, setSelectedVideo] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("selectedVideo")
    if (!stored) {
      router.push("/select")
    } else {
      setSelectedVideo(JSON.parse(stored))
    }
  }, [router])

  // Check recording status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(API_BASE_URL+"/status")
        const data = await response.json()
        setIsRecording(data.streaming)
      } catch (error) {
        console.error("Error checking status:", error)
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // --- ADDED: Cleanup effect to stop RTSP stream on unmount ---
  useEffect(() => {
    // The returned function is the cleanup function
    return () => {
      const stored = localStorage.getItem("selectedVideo")
      if (stored) {
        const video = JSON.parse(stored)
        // Only stop the stream if it was an RTSP stream
        if (video.type === "rtsp") {
          console.log("Navigating away from RTSP chat, sending stop signal...")
          // Use fetch with `keepalive: true` to ensure the request is sent
          // even if the page is being unloaded.
          fetch(`${API_BASE_URL}/api/rtsp/stop`, {
            method: "POST",
            keepalive: true,
          }).catch(error => {
            // This error might not be visible if the page unloads quickly, but it's good practice.
            console.error("Error sending stop signal on page unload:", error)
          });
        }
      }
    }
  }, []) // Empty dependency array ensures this runs only once on mount and unmount

  if (!selectedVideo) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/select")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="font-semibold">{selectedVideo.name}</h2>
              <p className="text-xs text-muted-foreground">
                {selectedVideo.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRecording ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-sm font-medium text-red-500">Recording</span>
              </>
            ) : (
              <>
                <Circle className="w-3 h-3 fill-green-500 text-green-500" />
                <span className="text-sm text-muted-foreground">Live</span>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-hidden">
        <div className="container mx-auto h-full px-2 pt-2 pb-4 md:px-4 md:pt-4">
          <ChatInterface />
        </div>
      </main>
    </div>
  )
}