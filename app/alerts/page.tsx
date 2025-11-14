"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Video, AlertCircle, ArrowLeft } from "lucide-react"
import { getApiBaseUrl } from "@/lib/api-config"

const API_BASE_URL = getApiBaseUrl()

interface VideoItem {
  id: string
  name: string
  path: string
}

export default function AlertsPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null)

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/videos`)
      const data = await response.json()
      setVideos(data.videos || [])
    } catch (error) {
      console.error("Failed to fetch videos:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVideo = (video: VideoItem) => {
    setSelectedVideo(video)
    router.push(`/alerts/tasks?videoId=${video.id}`)
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-br from-background via-muted/30 to-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">Select Video to Monitor</h1>
            <p className="text-muted-foreground text-lg">
              Choose a video to create detection tasks and alerts
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <Card
                key={video.id}
                className="group hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-primary/50"
                onClick={() => handleSelectVideo(video)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Video className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="mt-4">{video.name}</CardTitle>
                  <CardDescription>
                    Click to create alerts for this video
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="outline">
                    Select Video
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}