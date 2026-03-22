import { Link } from "react-router-dom"
import { Sun, Moon, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { shortenAddress } from "@/lib/utils"
import { LenclawLogo } from "@/components/shared/LenclawLogo"
import { useThemeContext } from "@/providers/ThemeProvider"
import { useWDK } from "@/providers/WDKProvider"
import { WDKWalletButton } from "@/components/wallet/WDKWalletButton"

export function MobileHeader() {
  const wdk = useWDK()
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
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>

          {wdk.isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => wdk.disconnect()}
              className="text-[10px] h-8 px-2.5 font-medium"
            >
              <Shield className="w-3 h-3 mr-1 text-teal-500" />
              {shortenAddress(wdk.address!)}
            </Button>
          ) : (
            <WDKWalletButton compact />
          )}
        </div>
      </div>
    </header>
  )
}
