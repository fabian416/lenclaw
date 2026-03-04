import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export default function MarketPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 text-center">
      <h1 className="text-2xl md:text-3xl font-bold mono-text mb-4">Market</h1>
      <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
        The secondary market has been removed. Deposit and withdraw directly from the lending pool.
      </p>
      <Button asChild>
        <Link to="/lend" className="flex items-center gap-2">
          Go to Lend <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  )
}
