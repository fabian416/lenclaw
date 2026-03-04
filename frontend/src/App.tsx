import { Routes, Route } from "react-router-dom"
import { Header } from "@/components/layout/Header"
import Home from "@/pages/Home"
import Dashboard from "@/pages/Dashboard"
import LendPage from "@/pages/Lend"
import AgentRegistry from "@/pages/AgentRegistry"
import AgentOnboarding from "@/pages/AgentOnboarding"
import BorrowPage from "@/pages/Borrow"

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="relative flex-1">
        <div className="absolute inset-0 z-0 pointer-events-none terminal-grid [background-attachment:local]" />

        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/lend" element={<LendPage />} />
            <Route path="/agents" element={<AgentRegistry />} />
            <Route path="/agents/onboard" element={<AgentOnboarding />} />
            <Route path="/borrow" element={<BorrowPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
