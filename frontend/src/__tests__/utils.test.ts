import { describe, it, expect } from "vitest"
import { cn, formatUSD, formatPercent, formatCompact, shortenAddress, formatDate } from "../lib/utils"

describe("cn (class name merge)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "visible")
    expect(result).toBe("base visible")
  })

  it("deduplicates tailwind classes", () => {
    const result = cn("p-4", "p-8")
    expect(result).toBe("p-8")
  })
})

describe("formatUSD", () => {
  it("formats whole numbers", () => {
    expect(formatUSD(1000)).toBe("$1,000")
  })

  it("formats large numbers with commas", () => {
    expect(formatUSD(2_450_000)).toBe("$2,450,000")
  })

  it("formats zero", () => {
    expect(formatUSD(0)).toBe("$0")
  })

  it("rounds decimals", () => {
    expect(formatUSD(99.99)).toBe("$100")
  })
})

describe("formatPercent", () => {
  it("formats with two decimal places", () => {
    expect(formatPercent(8.5)).toBe("8.50%")
  })

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.00%")
  })

  it("formats 100", () => {
    expect(formatPercent(100)).toBe("100.00%")
  })
})

describe("formatCompact", () => {
  it("formats millions", () => {
    expect(formatCompact(2_450_000)).toBe("2.5M")
  })

  it("formats thousands", () => {
    expect(formatCompact(12_400)).toBe("12.4K")
  })

  it("formats small numbers", () => {
    expect(formatCompact(500)).toBe("500")
  })

  it("handles exact million boundary", () => {
    expect(formatCompact(1_000_000)).toBe("1.0M")
  })

  it("handles exact thousand boundary", () => {
    expect(formatCompact(1_000)).toBe("1.0K")
  })
})

describe("shortenAddress", () => {
  const address = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e"

  it("shortens with default chars", () => {
    const result = shortenAddress(address)
    expect(result).toBe("0x742d...bD1e")
  })

  it("shortens with custom chars", () => {
    const result = shortenAddress(address, 8)
    expect(result).toBe("0x742d35Cc...f2bD1e")
  })

  it("includes 0x prefix", () => {
    const result = shortenAddress(address)
    expect(result.startsWith("0x")).toBe(true)
  })
})

describe("formatDate", () => {
  it("formats unix timestamp to readable date", () => {
    // Jan 1, 2024
    const result = formatDate(1704067200)
    expect(result).toContain("2024")
    expect(result).toContain("Jan")
  })

  it("handles different dates", () => {
    // Mar 1, 2024
    const result = formatDate(1709251200)
    expect(result).toContain("2024")
  })
})
