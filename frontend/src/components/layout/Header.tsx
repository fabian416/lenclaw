import { Link, NavLink } from "react-router-dom"
import { Bot, Menu, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"

function navClasses(isActive: boolean) {
  const base =
    "relative inline-block tracking-wide transition-colors duration-150 mono-text text-sm " +
    "after:absolute after:left-1/2 after:bottom-[-2px] after:h-[2px] after:w-0 " +
    "after:-translate-x-1/2 after:rounded-full after:bg-primary " +
    "after:transition-all after:duration-200"
  return isActive
    ? `${base} text-foreground after:w-10`
    : `${base} text-muted-foreground hover:text-primary hover:after:w-6`
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/lend", label: "Lend" },
  { to: "/agents", label: "Agents" },
  { to: "/borrow", label: "Borrow" },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <header className="border-b border-primary/15 bg-background/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="group flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="text-xl md:text-2xl font-bold text-primary mono-text terminal-cursor truncate">
            LENCLAW
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {({ isActive }) => (
                <span className={navClasses(isActive)}>{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Wallet / Mobile menu */}
        <div className="flex items-center gap-3">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              className="mono-text text-xs border-primary/30 hover:border-primary"
            >
              {shortenAddress(address!)}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: injected() })}
              className="mono-text text-xs"
            >
              Connect Wallet
            </Button>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border px-4 py-4 flex flex-col gap-3 bg-background">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `mono-text text-sm py-2 px-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
