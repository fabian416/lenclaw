import { Link, NavLink } from "react-router-dom"
import { Menu, X, Wallet } from "lucide-react"
import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"
import { GlitchText } from "@/components/reactbits/GlitchText"

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/lend", label: "Lend" },
  { to: "/agents", label: "Agents" },
  { to: "/borrow", label: "Borrow" },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={`border-b sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-white/10 bg-black/60 backdrop-blur-xl"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold tracking-tight text-white">
            <GlitchText text="lenclaw" />
          </span>
          <span className="text-[10px] font-medium text-[#14f195] uppercase tracking-widest">
            protocol
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {({ isActive }) => (
                <span
                  className={`relative px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                    isActive
                      ? "text-[#14f195]"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-[#14f195]/10 rounded-md -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              className="text-xs font-medium h-8 border-white/20 hover:border-[#14f195]/50 bg-transparent text-white"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#14f195] mr-2" />
              {shortenAddress(address!)}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: injected() })}
              className="text-xs font-semibold h-8 bg-[#14f195] text-black hover:bg-[#14f195]/90"
            >
              <Wallet className="w-3.5 h-3.5 mr-1.5" />
              Connect
            </Button>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-white/50 hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-white/10 overflow-hidden"
          >
            <div className="px-4 py-3 flex flex-col gap-0.5 bg-[#0a0a0a]/95 backdrop-blur-xl">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `text-sm py-2.5 px-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#14f195]/10 text-[#14f195] font-medium"
                        : "text-white/50 hover:text-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
