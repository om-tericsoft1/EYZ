"use client"

import { useState, useEffect } from "react"
import { Bot, User, Mic, Camera, ImageIcon, Video, Image as ImageIconLucide } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "./ui/button"

// --- UPDATED INTERFACES ---
interface AiDebugInfo { audio_description?: string; summary?: string; video_description?: string; }
interface MessageSource { videoPath?: string; screenshotPath?: string; }

interface Message {
  id: string
  content: string
  type: "user" | "ai"
  timestamp: Date
  mediaType?: "text" | "voice" | "image" | "video"
  debugInfo?: AiDebugInfo
  source?: MessageSource
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [formattedTime, setFormattedTime] = useState("")
  const [isClient, setIsClient] = useState(false)
  // --- NEW STATE for toggling between video and image ---
  const [showVideo, setShowVideo] = useState(false)

  useEffect(() => {
    setFormattedTime(message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    setIsClient(true)
  }, [message.timestamp])

  const isUser = message.type === "user"
  const hasDebugInfo = !isUser && message.debugInfo && (message.debugInfo.summary || message.debugInfo.audio_description || message.debugInfo.video_description)
  const hasSource = !isUser && message.source && (message.source.videoPath || message.source.screenshotPath)
  
  // Use our new media proxy API route
  const videoSrc = message.source?.videoPath ? `/api/media/${message.source.videoPath}` : ""
  const imageSrc = message.source?.screenshotPath ? `/api/media/${message.source.screenshotPath}` : ""

  const getMediaIcon = () => { /* ... unchanged ... */ return null }

  return (
    <div className={cn("flex items-start space-x-3 animate-in slide-in-from-bottom-2 duration-300", isUser ? "flex-row-reverse space-x-reverse" : "")}>
      <Avatar className="w-8 h-8 border-2 border-border">
        <AvatarFallback className={cn("text-xs font-medium", isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn("max-w-xs md:max-w-md lg:max-w-lg", isUser ? "items-end" : "items-start")}>
        <div className={cn("rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md", isUser ? "bg-primary text-primary-foreground ml-auto" : "bg-muted text-muted-foreground")}>
          
          {/* --- SOURCE MEDIA DISPLAY --- */}
          {hasSource && (
            <div className="p-2">
              <div className="relative rounded-lg overflow-hidden border border-border">
                {showVideo && videoSrc ? (
                  <video src={videoSrc} controls autoPlay muted className="w-full h-auto aspect-video bg-black" />
                ) : (
                  imageSrc && <img src={imageSrc} alt="Analysis source screenshot" className="w-full h-auto aspect-video object-cover" />
                )}
                {/* Toggle Button */}
                {videoSrc && imageSrc && (
                   <Button size="sm" variant="secondary" className="absolute top-2 right-2 h-8 opacity-80 hover:opacity-100" onClick={() => setShowVideo(!showVideo)}>
                     {showVideo ? <ImageIconLucide className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
                     {showVideo ? "Image" : "Video"}
                   </Button>
                )}
              </div>
            </div>
          )}
          
          <div className="px-4 pb-2 pt-2">
            <div className="flex items-center space-x-1 mb-1">
              {getMediaIcon()}
              <span className="text-xs opacity-70">{isClient ? formattedTime : ""}</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>

            {hasDebugInfo && (
              <Accordion type="single" collapsible className="w-full mt-2">
                <AccordionItem value="debug-info" className="border-b-0">
                  <AccordionTrigger className="text-xs py-1 hover:no-underline text-muted-foreground">Show Debug Info</AccordionTrigger>
                  <AccordionContent className="text-xs pt-2 pb-0 space-y-2 text-muted-foreground/80">
                    {message.debugInfo?.summary && (<div><h4 className="font-semibold text-muted-foreground">Summary</h4><p className="whitespace-pre-wrap">{message.debugInfo.summary}</p></div>)}
                    {message.debugInfo?.audio_description && (<div className="mt-2"><h4 className="font-semibold text-muted-foreground">Audio Description</h4><p className="whitespace-pre-wrap">{message.debugInfo.audio_description}</p></div>)}
                    {message.debugInfo?.video_description && (<div className="mt-2"><h4 className="font-semibold text-muted-foreground">Video Description</h4><p className="whitespace-pre-wrap">{message.debugInfo.video_description}</p></div>)}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}