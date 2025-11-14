"use client"

import { Button } from "@/components/ui/button"
import { Moon, Sun, Menu, ChevronDown, BotMessageSquare } from "lucide-react" // Updated imports
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet" // Import Sheet components

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Navigation and action links
  const navLinks = (
    <>
      <a href="#" className="text-foreground hover:text-muted-foreground transition-colors p-2 rounded-md">
        Features
      </a>
      <a href="#" className="text-foreground hover:text-muted-foreground transition-colors p-2 rounded-md">
        About
      </a>
      <a href="#" className="text-foreground hover:text-muted-foreground transition-colors p-2 rounded-md">
        Contact
      </a>
    </>
  )
  
  // A loading skeleton for the theme toggle to prevent layout shift
  if (!mounted) {
    return <header className="h-[65px] border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50"></header>
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      {/* --- DESKTOP HEADER --- */}
      <div className="container mx-auto px-4 py-4 hidden md:flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BotMessageSquare className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold">EYZ</h1>
        </div>
        <nav className="flex items-center space-x-2">{navLinks}</nav>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="hover:bg-accent/20"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>

      {/* --- MOBILE HEADER --- */}
      <div className="container mx-auto px-2 py-2 md:hidden flex items-center justify-between">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px]">
            <SheetHeader>
              <SheetTitle className="flex items-center space-x-2">
                <BotMessageSquare className="w-6 h-6 text-primary" />
                <span>EYZ</span>
              </SheetTitle>
            </SheetHeader>
            <div className="py-4">
              <nav className="flex flex-col gap-2">{navLinks}</nav>
            </div>
            <div className="absolute bottom-4 left-4 right-4">
               <div className="flex items-center justify-between p-2 rounded-lg bg-muted">
                 <span className="text-sm font-medium">Theme</span>
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === 'dark' ? <Sun className="h-5 w-5"/> : <Moon className="h-5 w-5"/>}
                    <span className="sr-only">Toggle theme</span>
                  </Button>
               </div>
            </div>
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-1 font-semibold">
          <span>EYZ</span>
          <ChevronDown className="h-4 w-4" />
        </div>
        
        {/* Placeholder for a right-side icon like in the image */}
        <div className="w-10 h-10"></div>
      </div>
    </header>
  )
}