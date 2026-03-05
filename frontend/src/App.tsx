import { Routes, Route } from "react-router-dom"
import { Header } from "@/components/layout/Header"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { BottomNav } from "@/components/layout/BottomNav"
import Home from "@/pages/Home"
import Dashboard from "@/pages/Dashboard"
import LendPage from "@/pages/Lend"
import AgentRegistry from "@/pages/AgentRegistry"
import AgentOnboarding from "@/pages/AgentOnboarding"
import BorrowPage from "@/pages/Borrow"

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-white">
      {/* Desktop header (hidden on mobile) */}
      <div className="hidden md:block">
        <Header />
      </div>

      {/* Mobile header (hidden on desktop) */}
      <MobileHeader />

      <main className="flex-1 pb-20 md:pb-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/lend" element={<LendPage />} />
          <Route path="/agents" element={<AgentRegistry />} />
          <Route path="/agents/onboard" element={<AgentOnboarding />} />
          <Route path="/borrow" element={<BorrowPage />} />
        </Routes>
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
