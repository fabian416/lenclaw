import { useLocation, useNavigate } from "react-router-dom"
import { Home, Bot, Briefcase, Radio, MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Dock } from "@/components/reactbits/Dock"

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { to: "/feed", icon: Radio, label: "Feed" },
] as const

const moreLinks = [
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/agents/onboard", label: "Register Agent" },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isExactMatch = (path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }

  const dockItems = [
    ...tabs.map((tab) => ({
      icon: <tab.icon className="w-5 h-5" strokeWidth={isExactMatch(tab.to) ? 2 : 1.5} />,
      label: tab.label,
      onClick: () => navigate(tab.to),
      isActive: isExactMatch(tab.to),
    })),
    {
      icon: <MoreHorizontal className="w-5 h-5" />,
      label: "More",
      onClick: () => setMoreOpen(!moreOpen),
      isActive: moreOpen || moreLinks.some((l) => location.pathname === l.to),
    },
  ]

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-[99] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-foreground/20 dark:bg-black/50" />
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+4rem)] right-3 w-48 rounded-lg bg-background/95 backdrop-blur-xl border border-border shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {moreLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMoreOpen(false)}
                className={`block px-4 py-3 text-sm transition-colors border-b border-border/50 last:border-0 ${
                  location.pathname === link.to
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden border-t border-border bg-background/90 backdrop-blur-xl safe-area-bottom">
        <Dock items={dockItems} />
      </nav>
    </>
  )
}
