export function getApiBaseUrl(): string {
  // In browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    
    // If accessing via localhost, use localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'https://localhost:8000'
    }
    
    // Otherwise use the same hostname as the frontend
    // This works when accessing via local IP (192.168.x.x)
    return `https://${hostname}:8000`
  }
  
  // Server-side fallback
  return 'https://0.0.0.0:8000'
}

export function getWsBaseUrl(): string {
  // In browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'wss://localhost:8000'
    }
    
    return `wss://${hostname}:8000`
  }
  
  // Server-side fallback
  return 'wss://0.0.0.0:8000'
}