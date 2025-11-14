"use client"

import { useState, useEffect, useRef } from "react" // --- Add useRef ---
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Plus, PlayCircle, AlertCircle, CheckCircle, XCircle, Trash2, Loader2, Clock, RefreshCw, Eye, Video } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getApiBaseUrl, getWsBaseUrl } from "@/lib/api-config"

const API_BASE_URL = getApiBaseUrl()
const WS_BASE_URL = getWsBaseUrl()

interface Task {
  id: string
  description: string
  status: "pending" | "running" | "completed"
  alerts: Alert[]
  created_at: string
}

interface Alert {
  id: string
  task_id: string
  detected: boolean
  confidence: number
  timestamp: string
  snapshot: string
  video_path: string
  details: string
  summary?: string
}

interface TaskDetails {
  id: string
  description: string
  video_id: string
  status: string
  created_at: string
  detections: Alert[]
  is_triggered: boolean
}

export default function TasksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  
  const videoId = searchParams.get("videoId")
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(10)
  const [selectedAlertForVideo, setSelectedAlertForVideo] = useState<Alert | null>(null)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)

  // --- START: ROBUST REAL-TIME UPDATE LOGIC ---
  useEffect(() => {
    if (!videoId) return

    let ws: WebSocket | null = null
    let reconnectTimer: NodeJS.Timeout | null = null

    const connect = () => {
      const wsUrl = `${WS_BASE_URL}/ws/chunks`
      console.log("🔗 Attempting WebSocket connection to:", wsUrl)

      try {
        ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log("✅ Tasks page connected to WebSocket for real-time updates.")
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === "alert_triggered") {
              const data = message.data
              
              const newAlert: Alert = {
                id: `alert_${Date.now()}`,
                task_id: data.alert_id,
                detected: data.detected,
                confidence: data.confidence,
                timestamp: data.timestamp,
                snapshot: data.snapshot,
                video_path: data.video_path,
                details: data.details,
                summary: data.summary,
              }
              
              setTasks(prevTasks => prevTasks.map(task => {
                if (task.id === data.alert_id) {
                  const isDuplicate = task.alerts.some(a => a.timestamp === newAlert.timestamp)
                  if (isDuplicate) return task
                  
                  return { ...task, alerts: [newAlert, ...task.alerts] }
                }
                return task
              }))

              setSelectedTask(prevSelected => {
                if (prevSelected && prevSelected.id === data.alert_id) {
                  const isDuplicate = prevSelected.alerts.some(a => a.timestamp === newAlert.timestamp)
                  if (isDuplicate) return prevSelected
                  
                  toast({
                    title: "⚡️ New Detection!",
                    description: `A new event was detected for the current task.`,
                  })
                  
                  return { ...prevSelected, alerts: [newAlert, ...prevSelected.alerts] }
                }
                return prevSelected
              })
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error)
          }
        }

        ws.onclose = () => {
          console.log("🔌 Tasks page WebSocket disconnected. Reconnecting in 3s...")
          if (reconnectTimer) clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(connect, 3000)
        }

        // ws.onerror = (err) => {
        //   console.error("WebSocket error on tasks page:", err)
        //   ws?.close() // This will trigger the onclose and start the reconnect timer
        // }
      } catch (error) {
        console.error("Failed to create WebSocket instance:", error)
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onclose = null // Prevent reconnection on component unmount
        ws.close()
      }
    }
  }, [videoId, toast])
  // --- END: ROBUST REAL-TIME UPDATE LOGIC ---


  useEffect(() => {
    if (videoId) {
      fetchTasks()
      
      const pollInterval = setInterval(() => {
        fetchTasks()
      }, 5000)
      
      return () => clearInterval(pollInterval)
    }
  }, [videoId])

  const fetchTasks = async () => {
    if (loading) return
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks?video_id=${videoId}`)
      const data = await response.json()
      // Preserve selected task's real-time updates while refreshing the list
      setSelectedTask(prevSelected => {
        const updatedTask = data.tasks.find((t: Task) => t.id === prevSelected?.id)
        if (updatedTask && prevSelected) {
          // If new alerts came from polling that aren't in the state yet
          if (updatedTask.alerts.length > prevSelected.alerts.length) {
            return updatedTask
          }
          return prevSelected
        }
        return null
      })
      setTasks(data.tasks || [])
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  // --- (The rest of your component remains unchanged) ---

  const handleCreateTask = async () => {
    if (!newTaskDescription.trim()) return
    
    setIsCreating(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/alerts?video_id=${videoId}&alert_description=${encodeURIComponent(newTaskDescription)}&interval_seconds=${intervalSeconds}`,
        { method: "POST" }
      )
      
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Task Created",
          description: `Checking video every ${intervalSeconds} seconds`,
        })
        
        setDialogOpen(false)
        setNewTaskDescription("")
        setIntervalSeconds(10)
        await fetchTasks()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "DELETE"
      })
      
      if (response.ok) {
        toast({
          title: "Task Deleted",
          description: "Task has been removed"
        })
        setSelectedTask(null)
        await fetchTasks()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive"
      })
    }
  }

  const handleRerunTask = async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/rerun`, {
        method: "POST"
      })
      
      if (response.ok) {
        toast({
          title: "Task Rerunning",
          description: "Task is being executed again"
        })
        await fetchTasks()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to rerun task",
        variant: "destructive"
      })
    }
  }

  const handleViewDetails = async (task: Task) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tasks/${task.id}/details`)
      const data = await response.json()
      setTaskDetails(data)
      setDetailsDialogOpen(true)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load task details",
        variant: "destructive"
      })
    }
  }

  const handleViewAlertVideo = (alert: Alert) => {
    setSelectedAlertForVideo(alert)
    setVideoDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      case "running":
        return <Badge variant="secondary" className="bg-blue-500">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      case "pending":
        return <Badge variant="outline">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-[65px] z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push("/alerts")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              <div>
                <h1 className="text-2xl font-bold">Video: {videoId}.mp4</h1>
                <p className="text-sm text-muted-foreground">
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''} created
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setVideoPlaying(!videoPlaying)}>
                <PlayCircle className="w-4 h-4 mr-2" />
                {videoPlaying ? "Hide" : "Show"} Video
              </Button>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Task
                </Button>

                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Detection Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="task-description">Task Description</Label>
                      <Input
                        id="task-description"
                        placeholder="e.g., Detect when a person is not wearing a helmet"
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="interval">Check Interval (seconds)</Label>
                      <Input
                        id="interval"
                        type="number"
                        min="5"
                        max="60"
                        step="5"
                        placeholder="10"
                        value={intervalSeconds}
                        onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 10)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        How often to check the video (5-60 seconds). Lower = more frequent checks.
                      </p>
                    </div>
                    
                    <Button
                      onClick={handleCreateTask}
                      disabled={isCreating || !newTaskDescription.trim()}
                      className="w-full"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Task"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Tasks Sidebar */}
          <div className="lg:col-span-1">
            <Card className="h-[calc(100vh-240px)]">
              <CardHeader>
                <CardTitle>Detection Tasks</CardTitle>
                <CardDescription>Active monitoring tasks</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-360px)] px-6 pb-6">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      { loading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                      ) : (
                        <>
                          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">No tasks created yet</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tasks.map((task) => (
                        <Card 
                          key={task.id}
                          className={`cursor-pointer transition-all ${
                            selectedTask?.id === task.id 
                              ? "border-primary bg-primary/5" 
                              : "hover:border-primary/50"
                          }`}
                          onClick={() => setSelectedTask(task)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <p className="text-sm font-medium line-clamp-2">
                                {task.description}
                              </p>
                              {getStatusBadge(task.status)}
                            </div>
                            
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                              <span>{task.alerts.length} detection{task.alerts.length !== 1 ? 's' : ''}</span>
                            </div>
                            
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs flex-1"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewDetails(task)
                                }}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Details
                              </Button>
                              
                              {task.status === "completed" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs flex-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRerunTask(task.id)
                                  }}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Rerun
                                </Button>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTask(task.id)
                                }}
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
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

          {/* Main Content */}
          <div className="lg:col-span-3">
            {videoPlaying && (
              <Card className="mb-6">
                <CardContent className="p-4">
                  <video
                    src={`/api/media/server/${videoId}.mp4`}
                    controls
                    autoPlay
                    className="w-full rounded-lg"
                  />
                </CardContent>
              </Card>
            )}

            {selectedTask ? (
              <Card>
                <CardHeader>
                  <CardTitle>Task Results</CardTitle>
                  <CardDescription>{selectedTask.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-400px)]">
                    {selectedTask.alerts.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>
                          {selectedTask.status === "running" 
                            ? "Task is analyzing the video..." 
                            : "No detections found"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedTask.alerts.map((alert) => (
                          <Card 
                            key={alert.id}
                            onClick={() => handleViewAlertVideo(alert)}
                            className={`group border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${
                              alert.detected 
                                ? "border-l-green-500" 
                                : "border-l-muted"
                            }`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                {alert.snapshot && (
                                  <div className="relative shrink-0">
                                    <img 
                                      src={`/api/media/${alert.snapshot}`}
                                      alt="Detection snapshot"
                                      className="w-32 h-20 rounded object-cover"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <PlayCircle className="w-8 h-8 text-white" />
                                    </div>
                                    {alert.detected ? (
                                      <CheckCircle className="absolute -top-2 -right-2 w-6 h-6 text-green-500 bg-background rounded-full" />
                                    ) : (
                                      <XCircle className="absolute -top-2 -right-2 w-6 h-6 text-muted-foreground bg-background rounded-full" />
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant={alert.detected ? "default" : "secondary"}>
                                      {(alert.confidence * 100).toFixed(1)}% confidence
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(alert.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  
                                  {alert.summary && (
                                    <p className="text-sm font-medium mb-2">{alert.summary}</p>
                                  )}
                                  
                                  <p className="text-sm text-muted-foreground mb-2">
                                    {alert.details}
                                  </p>
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
            ) : (
              <div className="flex items-center justify-center h-[calc(100vh-240px)] text-muted-foreground">
                <p>Select a task to view its results.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
          </DialogHeader>
          
          {taskDetails && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 p-1">
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground">{taskDetails.description}</p>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Status</h4>
                    {getStatusBadge(taskDetails.status)}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1">Created</h4>
                    <p className="text-sm text-muted-foreground">
                      {new Date(taskDetails.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-3">Detections ({taskDetails.detections.length})</h3>
                  <div className="space-y-3">
                    {taskDetails.detections.map((detection) => (
                      <Card key={detection.id} className="border-l-4 border-l-primary">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={detection.detected ? "default" : "secondary"}>
                              {detection.detected ? "Detected" : "Not Detected"}
                            </Badge>
                            <Badge variant="outline">
                              {(detection.confidence * 100).toFixed(1)}%
                            </Badge>
                          </div>
                          {detection.summary && (
                            <p className="text-sm font-medium mb-1">{detection.summary}</p>
                          )}
                          <p className="text-sm text-muted-foreground">{detection.details}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Video Dialog */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5" />
              Detection Video Playback
            </DialogTitle>
            <DialogDescription>
              Video chunk for detection at {selectedAlertForVideo && new Date(selectedAlertForVideo.timestamp).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedAlertForVideo && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  src={`/api/media/${selectedAlertForVideo.video_path}`}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {selectedAlertForVideo.summary && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Summary</h4>
                      <p className="text-sm text-muted-foreground">{selectedAlertForVideo.summary}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium mb-1">Details</h4>
                    <p className="text-sm text-muted-foreground">{selectedAlertForVideo.details}</p>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Confidence:</span>
                      <Badge variant={selectedAlertForVideo.detected ? "default" : "secondary"} className="ml-2">
                        {(selectedAlertForVideo.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Detected:</span>
                      {selectedAlertForVideo.detected ? (
                        <CheckCircle className="inline-block w-4 h-4 ml-2 text-green-500" />
                      ) : (
                        <XCircle className="inline-block w-4 h-4 ml-2 text-muted-foreground" />
                      )}
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