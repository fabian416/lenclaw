import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { WalletProvider } from "@/providers/WalletProvider"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="h-3 w-3 animate-ping rounded-full bg-primary/70" />
                <span className="mono-text">Loading Lenclaw...</span>
              </div>
            </div>
          }
        >
          <App />
        </Suspense>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>
)
