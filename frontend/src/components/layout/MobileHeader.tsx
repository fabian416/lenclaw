import { Link } from "react-router-dom"
import { Bot, Menu, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"
import { NavLink } from "react-router-dom"

const secondaryLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/lend", label: "Lend" },
  { to: "/agents", label: "Agents" },
  { to: "/agents/onboard", label: "Register Agent" },
  { to: "/borrow", label: "Borrow" },
]

export function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <header className="md:hidden border-b border-primary/15 bg-background/95 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <span className="text-lg font-bold text-primary mono-text terminal-cursor">
            LENCLAW
          </span>
        </Link>

        {/* Right side: wallet + hamburger */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              className="mono-text text-[10px] h-8 px-2.5 border-primary/30 hover:border-primary"
            >
              {shortenAddress(address!)}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: injected() })}
              className="mono-text text-[10px] h-8 px-2.5"
            >
              Connect
            </Button>
          )}

          <button
            className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Hamburger dropdown */}
      {menuOpen && (
        <nav className="border-t border-border px-4 py-3 flex flex-col gap-1 bg-background">
          {secondaryLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `mono-text text-sm py-3 px-4 rounded-xl transition-colors min-h-[44px] flex items-center ${
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
