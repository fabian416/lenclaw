import { Routes, Route, Navigate } from "react-router-dom"
import { Header } from "@/components/layout/Header"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { BottomNav } from "@/components/layout/BottomNav"
import Home from "@/pages/Home"
import AgentMarketplace from "@/pages/AgentMarketplace"
import AgentOnboarding from "@/pages/AgentOnboarding"
import AgentDetail from "@/pages/AgentDetail"
import Portfolio from "@/pages/Portfolio"
import Leaderboard from "@/pages/Leaderboard"
import Feed from "@/pages/Feed"
import { Noise } from "@/components/reactbits/Noise"

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

      <main className="flex-1 pb-20 md:pb-0">
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
        </Routes>
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
