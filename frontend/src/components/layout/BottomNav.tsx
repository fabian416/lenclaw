import { NavLink, useLocation } from "react-router-dom"
import { Home, LayoutDashboard, ArrowDownToLine, Bot, MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/lend", icon: ArrowDownToLine, label: "Lend" },
  { to: "/agents", icon: Bot, label: "Agents" },
] as const

const moreLinks = [
  { to: "/borrow", label: "Borrow" },
  { to: "/agents/onboard", label: "Register Agent" },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  return (
    <>
      {/* "More" overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-[99] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+4rem)] right-3 w-48 rounded-xl bg-card border border-primary/15 shadow-xl shadow-black/30 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {moreLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMoreOpen(false)}
                className={`block px-4 py-3.5 text-sm mono-text transition-colors border-b border-border/50 last:border-0 ${
                  location.pathname === link.to
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden border-t border-primary/15 bg-background/95 backdrop-blur-md safe-area-bottom">
        <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 gap-0.5 relative transition-colors min-h-[44px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                  )}
                  <tab.icon className="w-5 h-5" />
                  <span className="text-[10px] mono-text font-medium">{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 relative transition-colors min-h-[44px] ${
              moreOpen || moreLinks.some((l) => location.pathname === l.to)
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            {(moreOpen || moreLinks.some((l) => location.pathname === l.to)) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
            )}
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] mono-text font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
