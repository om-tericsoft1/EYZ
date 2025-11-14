"use client"

import { Suspense } from "react" // --- ADD THIS IMPORT ---
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ArrowLeft, AlertCircle, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getApiBaseUrl } from "@/lib/api-config"

const API_BASE_URL = getApiBaseUrl()

// --- THIS IS THE NEW INNER COMPONENT ---
function CreateAlertForm() {
  const router = useRouter()
  // useSearchParams is now safely inside a component wrapped by Suspense
  const searchParams = useSearchParams() 
  const { toast } = useToast()
  
  const [video, setVideo] = useState<any>(null)
  const [alertDescription, setAlertDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    // This logic now runs on the client after suspense resolves
    const stored = localStorage.getItem("selectedVideoForAlert")
    if (stored) {
      setVideo(JSON.parse(stored))
    } else {
      // If you are using searchParams to pass video info, you would use it here.
      // Since you use localStorage, this part remains the same.
      // But just having useSearchParams() requires this structure.
      router.push("/alerts")
    }
  }, [router, searchParams]) // Add searchParams to dependency array

  const handleCreateAlert = async () => {
    if (!alertDescription.trim()) {
      toast({
        title: "Error",
        description: "Please enter an alert description",
        variant: "destructive"
      })
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/alerts?video_id=${video.id}&alert_description=${encodeURIComponent(alertDescription)}`,
        {
          method: "POST"
        }
      )
      
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Alert Created",
          description: "Your real-time alert is now active",
        })
        router.push("/alerts/monitor")
      } else {
        throw new Error("Failed to create alert")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create alert. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsCreating(false)
    }
  }

  if (!video) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => router.push("/alerts")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Videos
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-primary" />
              <CardTitle>Create Real-Time Alert</CardTitle>
            </div>
            <CardDescription>
              Configure your alert for <strong>{video.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="alert-description">Alert Description</Label>
              <Textarea
                id="alert-description"
                placeholder="e.g., I want alert when a person is not wearing a helmet"
                value={alertDescription}
                onChange={(e) => setAlertDescription(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                Describe what condition should trigger an alert
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Example Alerts:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Person not wearing safety equipment</li>
                <li>• Unauthorized person detected</li>
                <li>• Object left unattended</li>
                <li>• Restricted area accessed</li>
              </ul>
            </div>

            <Button
              onClick={handleCreateAlert}
              disabled={isCreating || !alertDescription.trim()}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating Alert...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Create Alert
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// --- THIS IS THE NEW PAGE COMPONENT ---
export default function CreateAlertPage() {
  return (
    // Wrap the component that uses the hook in Suspense
    <Suspense fallback={<Loading />}>
      <CreateAlertForm />
    </Suspense>
  )
}

function Loading() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
    </div>
  )
}