import { Link, NavLink } from "react-router-dom"
import { Menu, X, Shield, Sun, Moon } from "lucide-react"
import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { shortenAddress } from "@/lib/utils"
import { GlitchText } from "@/components/reactbits/GlitchText"
import { LenclawLogo } from "@/components/shared/LenclawLogo"
import { useThemeContext } from "@/providers/ThemeProvider"
import { useWDK } from "@/providers/WDKProvider"
import { WDKWalletButton } from "@/components/wallet/WDKWalletButton"

const navItems = [
  { to: "/agents", label: "Agents" },
  { to: "/agents/onboard", label: "Register Agent" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/feed", label: "Feed" },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const wdk = useWDK()
  const { theme, toggleTheme } = useThemeContext()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={`border-b sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-border bg-background/80 backdrop-blur-xl shadow-sm"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2">
          <LenclawLogo className="w-8 h-8" />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            <GlitchText text="Lenclaw" />
          </span>
          <span className="text-[10px] font-medium text-primary uppercase tracking-widest">
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
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-primary/10 rounded-md -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>

          {/* WDK Wallet */}
          {wdk.isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => wdk.disconnect()}
              className="text-xs font-medium h-8"
            >
              <Shield className="w-3 h-3 mr-1.5 text-teal-500" />
              {shortenAddress(wdk.address!)}
            </Button>
          ) : (
            <WDKWalletButton compact />
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
            className="md:hidden border-t border-border overflow-hidden"
          >
            <div className="px-4 py-3 flex flex-col gap-0.5 bg-background/95 backdrop-blur-xl">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `text-sm py-2.5 px-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground"
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
