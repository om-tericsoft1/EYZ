"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mic, Send, Loader2, Camera, Image, Volume2, BrainCircuit, Bug, PlusCircle } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog"
import { VoiceVisualizer } from "@/components/voice-visualizer"
import { MessageBubble } from "@/components/message-bubble"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useChunkMonitor } from "@/hooks/use-chunk-monitor"
import { getApiBaseUrl } from "@/lib/api-config"

// ... (interfaces remain the same) ...

interface AiDebugInfo { 
  audio_description?: string
  summary?: string
  video_description?: string
}

interface MessageSource { 
  videoPath?: string
  screenshotPath?: string
}

interface Message {
  id: string
  content: string
  type: "user" | "ai"
  timestamp: Date
  mediaType?: "text" | "voice" | "image" | "video"
  debugInfo?: AiDebugInfo
  source?: MessageSource
}

type AnalysisMode = "smart" | "video" | "audio" | "image"


const API_BASE_URL = getApiBaseUrl()

const ELEVENLABS_API_KEY = "sk_113ba2c2a347a19cc47856f891a25fef49795375352bfcbb"
const ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [serverStatus, setServerStatus] = useState<"unknown" | "online" | "offline">("unknown")
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("smart")
  const [isDebugMode, setIsDebugMode] = useState(false)
  const [isTTSEnabled, setIsTTSEnabled] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSttModalOpen, setIsSttModalOpen] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  
  // --- FIX 1: ADD NEW STATE TO TRACK AUDIO UNLOCK ---
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const { toast } = useToast()

  const [selectedVideo, setSelectedVideo] = useState<any>(null)
  // Inside the ChatInterface component, add this after other hooks:
const { startMonitoring, stopMonitoring } = useChunkMonitor()

// Add this useEffect after existing useEffects:
useEffect(() => {
  const cleanup = startMonitoring()
  return () => {
    stopMonitoring()
    if (cleanup) cleanup()
  }
}, [startMonitoring, stopMonitoring])



  useEffect(() => {
    const stored = localStorage.getItem("selectedVideo")
    if (stored) {
      setSelectedVideo(JSON.parse(stored))
    }
  }, [])


// Add this useEffect to set RTSP URL when video is selected
useEffect(() => {
  const setRTSPIfNeeded = async () => {
    const stored = localStorage.getItem("selectedVideo")
    if (stored) {
      const video = JSON.parse(stored)
      if (video.type === "rtsp" && video.url) {
        try {
          const response = await fetch(`${API_BASE_URL}/set-rtsp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: video.url })
          })
          const data = await response.json()
          console.log("RTSP URL set:", data)
        } catch (error) {
          console.error("Failed to set RTSP URL:", error)
        }
      }
    }
  }
  
  setRTSPIfNeeded()
}, [])

  useEffect(() => {
    setMessages([
      {
        id: "1",
        content: "Hello! I'm your AI assistant. Click the '+' button to select an analysis mode or just start typing to ask me anything.",
        type: "ai",
        timestamp: new Date(),
        mediaType: "text",
      },
    ])
  }, [])

  useEffect(() => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [inputValue])

  useEffect(() => { 
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (viewport) { 
        requestAnimationFrame(() => { 
          viewport.scrollTop = viewport.scrollHeight 
        }) 
      }
    }
  }, [messages])
  
  const getMockResponse = (question: string): string => "This is a mock response because the AI server is offline."
  
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state !== "suspended") return
    try {
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        audioContextRef.current = new AudioContext()
        console.log("AudioContext created.");
      }
      const context = audioContextRef.current
      if (context.state === 'suspended') {
        context.resume().then(() => {
          console.log("AudioContext resumed successfully.");
        });
      }
      // Play a silent sound to keep the context active on some browsers
      const buffer = context.createBuffer(1, 1, 22050)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.start(0)
    } catch (e) { 
      console.error("Failed to initialize AudioContext:", e) 
    }
  }, [])

  // --- FIX 2: CREATE A ONE-TIME UNLOCK FUNCTION ---
  const unlockAudio = useCallback(() => {
    if (!isAudioUnlocked) {
      console.log("Attempting to unlock audio context...");
      initAudioContext();
      setIsAudioUnlocked(true);
    }
  }, [isAudioUnlocked, initAudioContext]);


  const stopAudio = useCallback(() => {
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop()
    }
  }, [])

  const streamAndPlayAudio = useCallback(async (text: string) => {
    if (!text.trim() || !ELEVENLABS_API_KEY) return
    stopAudio()
    setIsSpeaking(true)

    // Ensure context is running before playing
    initAudioContext()

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { 
          "xi-api-key": ELEVENLABS_API_KEY, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
          text, 
          model_id: "eleven_flash_v2_5" 
        }),
      })

      if (!response.ok) throw new Error(`API responded with status: ${response.status}`)

      const audioData = await response.arrayBuffer()
      
      const audioContext = audioContextRef.current!
      const audioBuffer = await audioContext.decodeAudioData(audioData)

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.onended = () => { 
        setIsSpeaking(false)
        currentAudioSourceRef.current = null 
      }
      source.start(0)
      currentAudioSourceRef.current = source
    } catch (error) {
      console.error("Error during text-to-speech:", error)
      toast({ 
        title: "Audio Error", 
        description: "Failed to generate or play speech.", 
        variant: "destructive" 
      })
      setIsSpeaking(false)
    }
  }, [stopAudio, initAudioContext, toast])

  // ... (sendMessage, transcribeAudio, startRecording, etc. remain the same) ...
  const sendMessage = useCallback(async (content: string, mediaType: "text" | "voice" = "text") => {
    if (!content.trim()) return
    
    const userMessage: Message = { 
      id: Date.now().toString(), 
      content, 
      type: "user", 
      timestamp: new Date(), 
      mediaType 
    }
    
    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    const endpointMap: Record<AnalysisMode, string> = { 
      smart: `${API_BASE_URL}/ask`, 
      video: `${API_BASE_URL}/ask/video`, 
      audio: `${API_BASE_URL}/ask/audio`, 
      image: `${API_BASE_URL}/ask/image`, 
    }
    const endpoint = endpointMap[analysisMode]

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      
      const response = await fetch(endpoint, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ question: content, time: "last" }), 
        signal: controller.signal, 
      })
      
      clearTimeout(timeoutId)
      if (!response.ok) throw new Error(`Server responded with status: ${response.status}`)
      
      const data = await response.json()
      setServerStatus("online")

      let aiContent = "I received a response but couldn't parse it."
      let debugInfo: AiDebugInfo | undefined = undefined

      try {
        const parsedAnswer = JSON.parse(data.answer)
        aiContent = parsedAnswer.answer || "The AI response was empty."
        if (isDebugMode) { 
          debugInfo = { 
            audio_description: parsedAnswer.audio_description, 
            summary: parsedAnswer.summary, 
            video_description: parsedAnswer.video_description 
          } 
        }
      } catch (e) { 
        console.error("Failed to parse AI response:", e)
        aiContent = data.answer || aiContent 
      }
      
      const source: MessageSource = { 
        videoPath: data.video, 
        screenshotPath: data.screenshot 
      }
      
      const aiMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        content: aiContent, 
        type: "ai", 
        timestamp: new Date(), 
        mediaType: "text", 
        debugInfo, 
        source 
      }
      
      setMessages((prev) => [...prev, aiMessage])
      
      if (isTTSEnabled && aiContent) {
        await streamAndPlayAudio(aiContent)
      }
    } catch (error) {
      console.log("[v0] API call failed:", error)
      setServerStatus("offline")
      const aiMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        content: getMockResponse(content), 
        type: "ai", 
        timestamp: new Date(), 
        mediaType: "text" 
      }
      setMessages((prev) => [...prev, aiMessage])
      
      if (serverStatus !== "offline") { 
        toast({ 
          title: "Server Offline", 
          description: "Using demo mode. Start your AI server for full functionality.", 
          variant: "default" 
        }) 
      }
    } finally { 
      setIsLoading(false) 
    }
  }, [analysisMode, isDebugMode, isTTSEnabled, serverStatus, toast, streamAndPlayAudio])

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true)
    toast({ 
      title: "Transcribing your voice...", 
      description: "Converting speech to text..." 
    })

    const formData = new FormData()
    formData.append("file", audioBlob, "recording.webm")
    formData.append("model_id", "scribe_v1")
    formData.append("tag_audio_events", "false")
    formData.append("language_code", "eng")

    try {
      const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API Error Response:", errorText)
        throw new Error(`Speech-to-text API failed with status ${response.status}: ${errorText}`)
      }
      
      const result = await response.json()
      
      if (result.text && result.text.trim()) {
        toast({ 
          title: "Transcription Complete", 
          description: `Recognized: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}"` 
        })
        sendMessage(result.text, "voice")
      } else {
        toast({ 
          title: "Transcription Empty", 
          description: "Couldn't hear anything. Please try again.", 
          variant: "destructive" 
        })
      }
    } catch (error) {
      console.error("Transcription error:", error)
      toast({ 
        title: "Transcription Failed", 
        description: "Could not convert your speech to text. Please try again.", 
        variant: "destructive" 
      })
    } finally {
      setIsTranscribing(false)
      setIsSttModalOpen(false)
    }
  }, [toast, sendMessage])

  const startRecording = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      toast({ title: "Unsupported Browser", description: "Your browser does not support audio recording.", variant: "destructive" })
      return
    }

    initAudioContext()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
      })
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4'
      
      const recorder = new MediaRecorder(stream, { mimeType })
      const localChunks: BlobPart[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          localChunks.push(e.data)
        }
      }
      
      recorder.onstop = () => {
        const blob = new Blob(localChunks, { type: mimeType })
        if (blob.size > 0) {
          transcribeAudio(blob)
        } else {
          toast({ title: "Recording Error", description: "No audio data recorded.", variant: "destructive" })
          setIsSttModalOpen(false) // Close modal on empty recording
        }
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e)
        toast({ title: "Recording Error", description: "An error occurred during recording.", variant: "destructive" })
        setIsSttModalOpen(false)
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      
      toast({ title: "Recording Started", description: "Speak now! Click the send button when done." })
    } catch (error) {
      console.error("Error starting recording:", error)
      toast({ title: "Microphone Error", description: "Unable to access microphone. Please check permissions.", variant: "destructive" })
    }
  }, [toast, initAudioContext, transcribeAudio])

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      setMediaRecorder(null)
      setIsRecording(false)
    }
  }, [mediaRecorder])

  const handleSttModalChange = useCallback((open: boolean) => {
    setIsSttModalOpen(open)
    if (!open) {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording()
      }
      setIsRecording(false)
      setIsTranscribing(false)
    }
  }, [mediaRecorder, stopRecording])

  useEffect(() => {
    if (isSttModalOpen && !isRecording && !isTranscribing) {
      const timer = setTimeout(() => {
        startRecording()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isSttModalOpen, isRecording, isTranscribing, startRecording])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { 
      e.preventDefault()
      handleSubmit(e) 
    }
  }
  
  const handleSubmit = (e: React.FormEvent) => { 
    e.preventDefault()
    initAudioContext()
    sendMessage(inputValue)
  }

  const AnalysisModeButton = ({ mode, icon, label }: { mode: AnalysisMode; icon: React.ReactNode; label: string }) => (
    <Button 
      variant={analysisMode === mode ? "secondary" : "ghost"} 
      className="w-full justify-start" 
      onClick={() => setAnalysisMode(mode)}
    >
      {icon} {label}
    </Button>
  )

  const getVisualizerLabel = () => {
    if (isTranscribing) return "Transcribing..."
    if (isRecording) return "Listening..."
    if (isSpeaking) return "Speaking..."
    return ""
  }

  const renderDialogContent = () => {
    if (isTranscribing) {
      return (
        <p className="text-sm text-muted-foreground text-center">
          Converting your speech to text...
        </p>
      )
    }
    if (isRecording) {
      return (
        <p className="text-sm text-muted-foreground text-center">
          Speak clearly into your microphone.<br />
          Click the send button when you're done.
        </p>
      )
    }
    return (
      <p className="text-sm text-muted-foreground text-center">
        Please wait, accessing your microphone...
      </p>
    )
  }

  return (
    <div className="h-full">
      {/* --- FIX 3: ADD onClick HANDLER TO THE MAIN CARD --- */}
      <Card className="h-full flex flex-col glass-effect" onClick={unlockAudio}>
        <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2 max-w-xs">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> 
                    <span className="text-sm">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {(isSpeaking || isRecording) && (
          <div className="px-4 py-2 border-t border-border shrink-0">
            <VoiceVisualizer isActive={isSpeaking || isRecording} label={getVisualizerLabel()} />
          </div>
        )}

        <div className="p-1 shrink-0">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end space-x-2 bg-muted/50 rounded-2xl p-2 border border-border">
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="shrink-0" disabled={isLoading}>
                    <PlusCircle className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 mb-2">
                  <div className="grid gap-2">
                    <h4 className="font-medium text-sm">Analysis Mode</h4>
                    <AnalysisModeButton mode="smart" icon={<BrainCircuit className="w-4 h-4 mr-2" />} label="Smart" />
                    <AnalysisModeButton mode="video" icon={<Camera className="w-4 h-4 mr-2" />} label="Video" />
                    <AnalysisModeButton mode="audio" icon={<Volume2 className="w-4 h-4 mr-2" />} label="Audio" />
                    <AnalysisModeButton mode="image" icon={<Image className="w-4 h-4 mr-2" />} label="Image" />
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <Label htmlFor="tts-mode" className="flex items-center gap-2 text-sm cursor-pointer">
                        <Volume2 className="h-4 w-4" /> Auto-Speak
                      </Label>
                      <Switch id="tts-mode" checked={isTTSEnabled} onCheckedChange={setIsTTSEnabled} />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <Label htmlFor="debug-mode" className="flex items-center gap-2 text-sm cursor-pointer">
                        <Bug className="h-4 w-4" /> Debug Mode
                      </Label>
                      <Switch id="debug-mode" checked={isDebugMode} onCheckedChange={setIsDebugMode} />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              <Textarea 
                ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} 
                onKeyDown={handleKeyDown} placeholder="Ask anything..." rows={1} 
                className="flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none px-2 resize-none max-h-48" 
                disabled={isLoading} 
              />
              
              <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => setIsSttModalOpen(true)} disabled={isLoading}>
                <Mic className="w-5 h-5" />
              </Button>
              
              <Button type="submit" size="icon" className="shrink-0 bg-primary w-8 h-8 rounded-lg" disabled={!inputValue.trim() || isLoading}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Dialog open={isSttModalOpen} onOpenChange={handleSttModalChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-medium">
              {isTranscribing ? "Transcribing..." : isRecording ? "Listening..." : "Preparing..."}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Use your voice to send a message. Recording will start automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 flex flex-col items-center space-y-4">
            <VoiceVisualizer isActive={isRecording || isTranscribing} />
            {renderDialogContent()}
          </div>
          <DialogFooter className="sm:justify-center items-center gap-4">
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="px-6" disabled={isTranscribing}>
                Cancel
              </Button>
            </DialogClose>
            <Button 
              type="button" size="icon" className="w-16 h-16 rounded-full"
              onClick={stopRecording}
              disabled={isTranscribing || !isRecording}
            >
              {isTranscribing ? (<Loader2 className="w-6 h-6 animate-spin" />) : (<Send className="w-6 h-6" />)}
              <span className="sr-only">Send Recording</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ChatInterface