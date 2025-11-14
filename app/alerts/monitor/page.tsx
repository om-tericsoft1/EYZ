"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, Trash2, Activity, Clock, Video, Play, Pause, Bell, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getApiBaseUrl, getWsBaseUrl } from "@/lib/api-config"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const API_BASE_URL = getApiBaseUrl()
const WS_BASE_URL = getWsBaseUrl()

interface Alert {
  id: string
  video_id: string
  description: string
  is_active: boolean
  last_check: string | null
  created_at: string
}

interface AlertLog {
  id: string
  alert_id: string
  video_id: string
  video_name: string
  description: string
  confidence: number
  details: string
  summary: string
  snapshot: string
  video_path: string
  timestamp: string
}

export default function MonitorAlertsPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<AlertLog | null>(null)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  useEffect(() => {
    fetchAlerts()
    
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    
    const connectWebSocket = () => {
      try {
        ws = new WebSocket(`${WS_BASE_URL}/ws/chunks`)
        
        ws.onopen = () => {
          setWsConnected(true)
          setWsError(null)
          console.log("✅ Connected to alert monitoring")
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            
            if (message.type === "alert_triggered") {
              const data = message.data
              
              const newLog: AlertLog = {
                id: `log_${Date.now()}`,
                alert_id: data.alert_id,
                video_id: data.video_id,
                video_name: data.video_name,
                description: data.description,
                confidence: data.confidence,
                details: data.details,
                summary: data.summary,
                snapshot: data.snapshot,
                video_path: data.video_path,
                timestamp: data.timestamp
              }
              
              setAlertLogs(prev => [newLog, ...prev])
              
              toast({
                title: "🚨 Alert Triggered!",
                description: (
                  <div className="space-y-2 mt-2">
                    <p className="font-semibold">{data.video_name}</p>
                    <p className="text-sm">{data.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Confidence: {(data.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                ),
                duration: 10000,
              })
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error)
          }
        }

        ws.onerror = (error) => {
          setWsError("WebSocket connection error")
          console.error("WebSocket error:", error)
        }

        ws.onclose = () => {
          setWsConnected(false)
          console.log("WebSocket closed, reconnecting in 3s...")
          reconnectTimeout = setTimeout(connectWebSocket, 3000)
        }
      } catch (error) {
        setWsError("Failed to connect to WebSocket")
        console.error("WebSocket connection failed:", error)
      }
    }
    
    connectWebSocket()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) {
        ws.close()
      }
    }
  }, [])

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts`)
      const data = await response.json()
      setAlerts(data.alerts || [])
    } catch (error) {
      console.error("Failed to fetch alerts:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAlert = async (alertId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}`, {
        method: "DELETE"
      })
      
      if (response.ok) {
        setAlerts(alerts.filter(a => a.id !== alertId))
        // Remove logs for this alert
        setAlertLogs(logs => logs.filter(log => log.alert_id !== alertId))
        toast({
          title: "Alert Deleted",
          description: "Alert has been removed"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete alert",
        variant: "destructive"
      })
    }
  }

  const handleViewVideo = (log: AlertLog) => {
    setSelectedLog(log)
    setVideoDialogOpen(true)
    setIsPlaying(false)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <Bell className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Alert Monitoring</h1>
                <p className="text-sm text-muted-foreground">
                  {alerts.length} active alert{alerts.length !== 1 ? 's' : ''} • {alertLogs.length} event{alertLogs.length !== 1 ? 's' : ''} logged
                </p>
              </div>
            </div>
            <Button onClick={() => router.push("/alerts")}>
              Create New Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Active Alerts Sidebar */}
          <div className="lg:col-span-1">
            <Card className="h-[calc(100vh-180px)] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Active Alerts
                </CardTitle>
                <CardDescription>
                  Currently monitoring {alerts.length} video{alerts.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-full px-6 pb-6">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No active alerts</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {alerts.map((alert) => (
                        <Card key={alert.id} className="border-l-4 border-l-primary">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="default" className="text-xs">
                                    {alert.video_id}.mp4
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    <Activity className="w-3 h-3 mr-1 animate-pulse" />
                                    Active
                                  </Badge>
                                </div>
                                <p className="text-sm font-medium mb-1 line-clamp-2">
                                  {alert.description}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>Created {new Date(alert.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8"
                                onClick={() => handleDeleteAlert(alert.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Alert Logs Main Panel */}
          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-180px)] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Alert Events
                </CardTitle>
                <CardDescription>
                  Real-time log of triggered alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-full px-6 pb-6">
                  {alertLogs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No alerts triggered yet</p>
                      <p className="text-sm">Waiting for events to be detected...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {alertLogs.map((log, index) => (
                        <Card 
                          key={log.id} 
                          className="border-l-4 border-l-destructive hover:shadow-lg transition-shadow cursor-pointer"
                          onClick={() => handleViewVideo(log)}
                        >
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              {/* Thumbnail */}
                              <div className="relative shrink-0">
                                <div className="w-32 h-20 rounded-lg overflow-hidden bg-muted">
                                  <img 
                                    src={`/api/media/${log.snapshot}`}
                                    alt="Alert snapshot"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23ddd" width="200" height="150"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E'
                                    }}
                                  />
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="p-2 rounded-full bg-black/50 backdrop-blur-sm">
                                    <Play className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="destructive" className="text-xs font-semibold">
                                      Alert #{index + 1}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {log.video_name}
                                    </Badge>
                                    <Badge 
                                      variant={log.confidence > 0.8 ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {(log.confidence * 100).toFixed(1)}% confidence
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground shrink-0">
                                    {formatTimestamp(log.timestamp)}
                                  </div>
                                </div>

                                <h3 className="font-semibold text-base mb-2 line-clamp-1">
                                  {log.description}
                                </h3>

                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                  {log.details}
                                </p>

                                <div className="flex items-center gap-2">
                                  <Button 
                                    size="sm" 
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleViewVideo(log)
                                    }}
                                  >
                                    <Video className="w-3 h-3 mr-1" />
                                    View Video
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    View Details
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Video Dialog */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5" />
              Alert Video Playback
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.video_name} • {selectedLog && formatTimestamp(selectedLog.timestamp)}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {/* Video Player */}
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  src={`/api/media/${selectedLog.video_path}`}
                  controls
                  autoPlay
                  className="w-full h-full"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>

              {/* Alert Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Condition</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedLog.description}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="text-sm font-medium mb-1">Detection Details</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedLog.details}
                    </p>
                  </div>

                  {selectedLog.summary && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-medium mb-1">Summary</h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedLog.summary}
                        </p>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Confidence:</span>
                      <Badge variant="default" className="ml-2">
                        {(selectedLog.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time:</span>
                      <span className="ml-2 font-medium">
                        {formatTimestamp(selectedLog.timestamp)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}