import { Link } from "react-router-dom"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"
import { LenclawLogo } from "@/components/shared/LenclawLogo"
import { useThemeContext } from "@/providers/ThemeProvider"

export function MobileHeader() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { theme, toggleTheme } = useThemeContext()

  return (
    <header className="md:hidden border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2">
          <LenclawLogo className="w-7 h-7" />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Lenclaw
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>

          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnect()}
              className="text-[10px] h-8 px-2.5 font-medium"
            >
              {shortenAddress(address!)}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => connect({ connector: injected() })}
              className="text-[10px] h-8 px-2.5 font-semibold"
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
