"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, MessageSquare, Video, TrendingUp } from "lucide-react"

export default function DashboardPage() {
  const router = useRouter()

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-br from-background via-muted/30 to-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Welcome to EYZ AI</h1>
          <p className="text-muted-foreground text-lg">
            AI-powered video analysis and real-time alerting system
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Alerts & Tasks Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:border-primary/50"
            onClick={() => router.push("/alerts")}
          >
            <CardHeader>
              <div className="p-3 rounded-lg bg-destructive/10 w-fit mb-4">
                <Bell className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Alerts & Tasks</CardTitle>
              <CardDescription className="text-base">
                Create custom alerts and monitor video events in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Select videos to monitor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Create custom detection tasks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Get instant notifications when conditions are met</span>
                </li>
              </ul>
              <Button className="w-full">
                Go to Alerts
              </Button>
            </CardContent>
          </Card>

          {/* Video Q&A Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:border-primary/50"
            onClick={() => router.push("/select")}
          >
            <CardHeader>
              <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Video Q&A</CardTitle>
              <CardDescription className="text-base">
                Ask questions about live video streams using AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Connect to RTSP streams or sample videos</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Ask questions via text or voice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Get AI-powered answers with video analysis</span>
                </li>
              </ul>
              <Button className="w-full">
                Start Q&A
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}