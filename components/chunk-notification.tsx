"use client"

import { Video, Clock, HardDrive } from "lucide-react"
import { Button } from "./ui/button"

interface ChunkNotificationProps {
  filename: string
  size: number
  created: string
  onView?: () => void
}

export function ChunkNotification({ filename, size, created, onView }: ChunkNotificationProps) {
  const createdDate = new Date(created)
  const timeStr = createdDate.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
  const sizeStr = (size / (1024 * 1024)).toFixed(1)

  return (
    <div className="flex items-start gap-3 w-full">
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Video className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">{timeStr}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="w-3 h-3" />
          <span>{sizeStr} MB</span>
        </div>
        {onView && (
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2 h-7 text-xs"
            onClick={onView}
          >
            View Chunk
          </Button>
        )}
      </div>
    </div>
  )
}