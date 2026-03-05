import { Link, NavLink } from "react-router-dom"
import { Menu, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"

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
    <header className="md:hidden border-b border-white/10 bg-black/60 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight text-white">
            lenclaw
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              className="text-[10px] h-8 px-2.5 font-medium border-white/20 bg-transparent text-white"
            >
              {shortenAddress(address!)}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: injected() })}
              className="text-[10px] h-8 px-2.5 font-semibold bg-[#14f195] text-black hover:bg-[#14f195]/90"
            >
              Connect
            </Button>
          )}

          <button
            className="p-2 text-white/50 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-white/10 px-4 py-3 flex flex-col gap-0.5 bg-[#0a0a0a]/95 backdrop-blur-xl">
          {secondaryLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `text-sm py-3 px-3 rounded-lg transition-colors min-h-[44px] flex items-center ${
                  isActive
                    ? "bg-[#14f195]/10 text-[#14f195] font-medium"
                    : "text-white/50 hover:text-white"
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
