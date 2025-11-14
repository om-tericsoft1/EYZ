"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Video, Radio, Plus, AlertCircle } from "lucide-react"  // Added AlertCircle
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface VideoSource {
  id: string
  name: string
  type: "default" | "rtsp"
  url?: string
  description: string
}

const DEFAULT_VIDEOS: VideoSource[] = [
  {
    id: "office-cam-1",
    name: "Office Camera 1",
    type: "default",
    description: "Main office area monitoring",
  },
  {
    id: "office-cam-2", 
    name: "Office Camera 2",
    type: "default",
    description: "Conference room view",
  },
  {
    id: "entrance-cam",
    name: "Entrance Camera",
    type: "default",
    description: "Building entrance monitoring",
  },
]

export default function SelectVideoPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<VideoSource[]>(DEFAULT_VIDEOS)
  const [isAddingRTSP, setIsAddingRTSP] = useState(false)
  const [newRTSP, setNewRTSP] = useState({ name: "", url: "", description: "" })

  const handleSelectVideo = (video: VideoSource) => {
    // Store selected video in localStorage
    localStorage.setItem("selectedVideo", JSON.stringify(video))
    router.push("/chat")
  }

  const handleAddRTSP = () => {
    if (newRTSP.name && newRTSP.url) {
      const newVideo: VideoSource = {
        id: `rtsp-${Date.now()}`,
        name: newRTSP.name,
        type: "rtsp",
        url: newRTSP.url,
        description: newRTSP.description || "Custom RTSP stream",
      }
      setVideos([...videos, newVideo])
      setNewRTSP({ name: "", url: "", description: "" })
      setIsAddingRTSP(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            EYZ
          </h1>
          <p className="text-muted-foreground text-lg">
            Select a video source to start analyzing
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {videos.map((video) => (
            <Card
              key={video.id}
              className="group hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-primary/50"
              onClick={() => handleSelectVideo(video)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    {video.type === "rtsp" ? (
                      <Radio className="w-6 h-6 text-primary" />
                    ) : (
                      <Video className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  {video.type === "rtsp" && (
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary/20 text-secondary-foreground">
                      Custom
                    </span>
                  )}
                </div>
                <CardTitle className="mt-4">{video.name}</CardTitle>
                <CardDescription>{video.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {video.url && (
                  <p className="text-xs text-muted-foreground truncate">
                    {video.url}
                  </p>
                )}
                <Button className="w-full mt-4" variant="outline">
                  Select & Continue
                </Button>
              </CardContent>
            </Card>

            
            
          ))}

          {/* Add RTSP Card */}
          <Dialog open={isAddingRTSP} onOpenChange={setIsAddingRTSP}>
            <DialogTrigger asChild>
              <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-primary/50 border-dashed">
                <CardHeader className="h-full flex flex-col items-center justify-center text-center">
                  <div className="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors mb-4">
                    <Plus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <CardTitle>Add RTSP Stream</CardTitle>
                  <CardDescription>
                    Connect a custom live video stream
                  </CardDescription>
                </CardHeader>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add RTSP Stream</DialogTitle>
                <DialogDescription>
                  Enter the details of your RTSP stream to start monitoring
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Stream Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Warehouse Camera"
                    value={newRTSP.name}
                    onChange={(e) => setNewRTSP({ ...newRTSP, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">RTSP URL</Label>
                  <Input
                    id="url"
                    placeholder="rtsp://username:password@ip:port/stream"
                    value={newRTSP.url}
                    onChange={(e) => setNewRTSP({ ...newRTSP, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of the stream"
                    value={newRTSP.description}
                    onChange={(e) => setNewRTSP({ ...newRTSP, description: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 mt-6">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsAddingRTSP(false)
                      setNewRTSP({ name: "", url: "", description: "" })
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAddRTSP}
                    disabled={!newRTSP.name || !newRTSP.url}
                  >
                    Add Stream
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
           {/* Add after the custom RTSP card in the grid */}
          <Card
            className="group hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-primary/50"
            onClick={() => router.push("/alerts")}
          >
            <CardHeader>
              <div className="p-2 rounded-lg bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle className="mt-4">Real-Time Alerts</CardTitle>
              <CardDescription>
                Create custom alerts for specific conditions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                Configure Alerts
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Selected streams will be analyzed in real-time</p>
        </div>
      </div>
    </div>
  )
}