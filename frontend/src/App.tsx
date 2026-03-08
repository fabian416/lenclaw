import { Routes, Route, Navigate, Link } from "react-router-dom"
import { Header } from "@/components/layout/Header"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { BottomNav } from "@/components/layout/BottomNav"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { WrongNetworkBanner } from "@/components/WrongNetworkBanner"
import Home from "@/pages/Home"
import AgentMarketplace from "@/pages/AgentMarketplace"
import AgentOnboarding from "@/pages/AgentOnboarding"
import AgentDetail from "@/pages/AgentDetail"
import Portfolio from "@/pages/Portfolio"
import Leaderboard from "@/pages/Leaderboard"
import Feed from "@/pages/Feed"
import { Noise } from "@/components/reactbits/Noise"

function NotFound() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-6">
        <span className="text-2xl font-bold text-muted-foreground">404</span>
      </div>
      <h2 className="text-lg font-semibold mb-2 text-foreground">Page not found</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Back to Home
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Noise opacity={0.03} className="fixed inset-0 z-50 pointer-events-none dark:opacity-[0.03] opacity-[0.02]" />
      {/* Desktop header (hidden on mobile) */}
      <div className="hidden md:block">
        <Header />
      </div>

      {/* Mobile header (hidden on desktop) */}
      <MobileHeader />

      <WrongNetworkBanner />

      <main className="flex-1 pb-20 md:pb-0">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/agents" element={<AgentMarketplace />} />
            <Route path="/agents/onboard" element={<AgentOnboarding />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/feed" element={<Feed />} />
            {/* Redirects for removed routes */}
            <Route path="/lend" element={<Navigate to="/agents" replace />} />
            <Route path="/borrow" element={<Navigate to="/agents" replace />} />
            <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
