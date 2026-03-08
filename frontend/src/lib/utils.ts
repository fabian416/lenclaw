import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { RiskLevel, AgentBadge } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(0)
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatAPY(apy: number): string {
  return `${apy.toFixed(1)}%`
}

export function getRiskColor(risk: RiskLevel): string {
  switch (risk) {
    case "safe": return "var(--success)"
    case "moderate": return "var(--primary)"
    case "risky": return "var(--warning)"
    case "degen": return "var(--destructive)"
  }
}

export function getRiskBgColor(risk: RiskLevel): string {
  switch (risk) {
    case "safe": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    case "moderate": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    case "risky": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    case "degen": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  }
}

export function getRiskLabel(risk: RiskLevel): string {
  switch (risk) {
    case "safe": return "Safe"
    case "moderate": return "Moderate"
    case "risky": return "Risky"
    case "degen": return "Degen"
  }
}

export function getAgentBadge(badge: AgentBadge): { label: string; className: string } {
  switch (badge) {
    case "hot_streak": return { label: "Hot Streak", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" }
    case "at_risk": return { label: "At Risk", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
    case "defaulted": return { label: "Defaulted", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
    case "top_earner": return { label: "Top Earner", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
    case "newcomer": return { label: "Newcomer", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" }
    case "consistent": return { label: "Consistent", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" }
    case "whale_backed": return { label: "Whale Backed", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" }
    case "smart_wallet": return { label: "Smart Wallet", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 ring-1 ring-sky-300/50 dark:ring-sky-500/30" }
  }
}

export function timeAgo(timestampSeconds: number): string {
  const now = Date.now() / 1000
  const diff = Math.max(0, now - timestampSeconds)

  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}
