"use client"

import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Bell, MessageSquare, Home, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function MainNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            EYZ
          </h1>
          
          <div className="flex items-center gap-2">
            <Button
              variant={pathname === "/dashboard" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              <Home className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            
            <Button
              variant={pathname.startsWith("/alerts") ? "secondary" : "ghost"}
              size="sm"
              onClick={() => router.push("/alerts")}
            >
              <Bell className="w-4 h-4 mr-2" />
              Alerts & Tasks
            </Button>
            
            <Button
              variant={pathname.startsWith("/chat") ? "secondary" : "ghost"}
              size="sm"
              onClick={() => router.push("/select")}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Video Q&A
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </nav>
  )
}