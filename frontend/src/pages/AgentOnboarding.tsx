import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Bot,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Cpu,
  Rocket,
  Globe,
  Shield,
  ChevronDown,
  Zap,
  Radio,
  Flame,
  Box,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
// wagmi removed — onboarding uses Tether WDK exclusively
import { shortenAddress } from "@/lib/utils"
import type { OnboardingFormData, AgentEcosystem, AgentCategory } from "@/lib/types"
import { ECOSYSTEM_CONFIG, AGENT_CATEGORIES } from "@/lib/constants"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { ClickSpark } from "@/components/reactbits/ClickSpark"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { useWDK } from "@/providers/WDKProvider"
import { WDKWalletButton } from "@/components/wallet/WDKWalletButton"
import { WDKBadge } from "@/components/wallet/WDKBadge"

// ── Ecosystem card icons ────────────────────────────────────────────────────

const ECOSYSTEM_ICONS: Record<AgentEcosystem, typeof Globe> = {
  virtuals: Zap,
  openclaw: Radio,
  clawnch: Flame,
  independent: Box,
}

// ── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: "Ecosystem", icon: Globe, description: "Where does your agent come from?" },
  { id: 2, title: "Details", icon: Bot, description: "Agent identity and trust configuration" },
  { id: 3, title: "Deploy", icon: Rocket, description: "Go live on Lenclaw" },
]

// ── Main component ──────────────────────────────────────────────────────────

export default function AgentOnboarding() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const wdk = useWDK()

  // WDK is the primary (and only) wallet for onboarding
  const anyWalletConnected = wdk.isConnected
  const activeAddress = wdk.address

  const [form, setForm] = useState<OnboardingFormData>({
    ecosystem: "independent",
    name: "",
    description: "",
    agentCategory: "Trading",
    codeHash: "",
    externalTokenAddress: "",
    externalAgentId: "",
    deploySmartWallet: true,
    teeProvider: "",
    teeAttestation: "",
  })

  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateForm = <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectEcosystem = (eco: AgentEcosystem) => {
    updateForm("ecosystem", eco)
    // Auto-set category for Clawnch
    if (eco === "clawnch") updateForm("agentCategory", "Trading")
    // Auto-enable smart wallet for all
    updateForm("deploySmartWallet", true)
  }

  const needsToken = ECOSYSTEM_CONFIG[form.ecosystem].needsTokenAddress

  const canProceed = () => {
    switch (step) {
      case 1:
        return anyWalletConnected
      case 2: {
        const hasBasicInfo = form.name.length > 0 && form.description.length > 0
        if (needsToken) return hasBasicInfo && form.externalTokenAddress.length > 0
        return hasBasicInfo
      }
      case 3:
        return true
      default:
        return false
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    await new Promise((r) => setTimeout(r, form.deploySmartWallet ? 3000 : 2000))
    setDeploying(false)
    setDeployed(true)
  }

  const ecoConfig = ECOSYSTEM_CONFIG[form.ecosystem]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-foreground">Register Agent</h1>
        <p className="text-muted-foreground text-sm">
          Onboard your AI agent to access revenue-backed credit lines
        </p>
      </div>

      {/* Step Indicator -- Desktop */}
      <div className="hidden md:flex items-center gap-0 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-colors ${
                step > s.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : step === s.id
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}>
                {step > s.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${step >= s.id ? "text-foreground" : "text-muted-foreground"}`}>
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px mx-2">
                <div className={`h-full ${step > s.id ? "bg-primary" : "bg-border"}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step Indicator -- Mobile */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</span>
          <span className="text-sm font-medium text-foreground">{STEPS[step - 1].title}</span>
        </div>
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${(step / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="border border-border bg-card rounded-xl p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            {(() => { const StepIcon = STEPS[step - 1].icon; return <StepIcon className="w-4 h-4 text-primary/60" /> })()}
            {STEPS[step - 1].title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{STEPS[step - 1].description}</p>
        </div>

        <AnimatePresence mode="wait">
          <AnimatedContent key={step} direction="right" distance={12}>

            {/* ── STEP 1: Ecosystem + Connect ─────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Wallet connect */}
                {wdk.isConnected ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-teal-500/[0.06] border border-teal-500/20">
                      <CheckCircle2 className="w-5 h-5 text-teal-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground flex items-center gap-2">
                          WDK Wallet Connected
                          <WDKBadge compact />
                        </div>
                        <div className="text-xs text-muted-foreground mono-text truncate">{shortenAddress(wdk.address!, 8)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <Shield className="w-10 h-10 text-teal-500/40 mx-auto" />
                    <div className="text-center space-y-1">
                      <p className="text-sm text-muted-foreground">Connect with Tether WDK to operate this agent</p>
                      <p className="text-[10px] text-muted-foreground/70">Self-custodial wallet — no browser extensions needed</p>
                    </div>
                    <WDKWalletButton />
                  </div>
                )}

                {/* Ecosystem selection */}
                {anyWalletConnected && (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Where does your agent come from?</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(Object.keys(ECOSYSTEM_CONFIG) as AgentEcosystem[]).map((eco) => {
                        const config = ECOSYSTEM_CONFIG[eco]
                        const Icon = ECOSYSTEM_ICONS[eco]
                        const selected = form.ecosystem === eco
                        return (
                          <button
                            key={eco}
                            onClick={() => selectEcosystem(eco)}
                            className={`text-left p-4 rounded-lg border-2 transition-all ${
                              selected
                                ? "border-primary bg-primary/[0.04]"
                                : "border-border hover:border-muted-foreground/30"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${config.color}15` }}
                              >
                                <Icon className="w-5 h-5" style={{ color: config.color }} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">{config.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{config.description}</div>
                                {config.autoFills.length > 0 && (
                                  <div className="text-[10px] text-primary mt-1.5">
                                    Auto-fills: {config.autoFills.join(", ")}
                                  </div>
                                )}
                              </div>
                              {selected && (
                                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: Details (adaptive per ecosystem) ────────────────── */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Ecosystem badge */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  {(() => { const Icon = ECOSYSTEM_ICONS[form.ecosystem]; return <Icon className="w-4 h-4" style={{ color: ecoConfig.color }} /> })()}
                  <span className="text-sm font-medium text-foreground">{ecoConfig.name}</span>
                </div>

                {/* Token address — Virtuals & Clawnch */}
                {needsToken && (
                  <div>
                    <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                      {form.ecosystem === "virtuals" ? "Agent Token Address" : "Clawnch Token Address"}
                    </label>
                    <Input
                      placeholder="0x..."
                      value={form.externalTokenAddress}
                      onChange={(e) => updateForm("externalTokenAddress", e.target.value)}
                      className="h-11 mono-text"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {form.ecosystem === "virtuals"
                        ? "The ERC-20 token address of your agent on Base. Name, metrics, and revenue will be auto-fetched."
                        : "Your launched token address. Trading fee revenue will be auto-verified."}
                    </p>
                  </div>
                )}

                {/* Agent ID — OpenClaw */}
                {form.ecosystem === "openclaw" && (
                  <div>
                    <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                      Moltbook Handle or Agent ID
                    </label>
                    <Input
                      placeholder="@your-agent or agent ID"
                      value={form.externalAgentId}
                      onChange={(e) => updateForm("externalAgentId", e.target.value)}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Your Moltbook handle, XMTP identity, or Bankr agent ID. Used for identity verification and reputation import.
                    </p>
                  </div>
                )}

                {/* Name & Description */}
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Agent Name</label>
                  <Input
                    placeholder="e.g., AutoTrader-v3"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Description</label>
                  <Textarea
                    placeholder="Describe what your agent does and how it generates revenue..."
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Category</label>
                  <div className="relative">
                    <select
                      value={form.agentCategory}
                      onChange={(e) => updateForm("agentCategory", e.target.value as AgentCategory)}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm text-foreground appearance-none cursor-pointer"
                      disabled={form.ecosystem === "clawnch"}
                    >
                      {AGENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Smart Wallet — default ON, opt-out */}
                <div className={`p-4 rounded-lg border transition-all ${
                  form.deploySmartWallet
                    ? "border-sky-300 bg-sky-50 dark:bg-sky-900/15 dark:border-sky-500/40"
                    : "border-border bg-muted"
                }`}>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      form.deploySmartWallet ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">Smart Wallet</span>
                        {form.deploySmartWallet && (
                          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">
                            Enabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {form.ecosystem === "virtuals"
                          ? "Auto-routes inference revenue to your Lockbox. Highest trust tier for backers."
                          : form.ecosystem === "openclaw"
                            ? "Auto-routes x402 payments and Bankr fees to your Lockbox for trustless repayment."
                            : form.ecosystem === "clawnch"
                              ? "Auto-routes trading fee revenue to your Lockbox. Maximum credit terms."
                              : "Auto-routes all USDC revenue to your Lockbox. Essential for building trust as an independent agent."}
                      </p>
                      {form.deploySmartWallet ? (
                        <button
                          onClick={() => updateForm("deploySmartWallet", false)}
                          className="text-[10px] text-muted-foreground underline mt-2 hover:text-foreground transition-colors"
                        >
                          Opt out (reduces credit score by 15%)
                        </button>
                      ) : (
                        <button
                          onClick={() => updateForm("deploySmartWallet", true)}
                          className="text-xs text-sky-600 dark:text-sky-400 font-medium mt-2 hover:underline transition-colors"
                        >
                          Enable Smart Wallet (+15% credit score)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tether WDK — always used as wallet provider */}
                {form.deploySmartWallet && (
                  <div className="p-3 rounded-lg bg-teal-500/[0.06] border border-teal-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-teal-500" />
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 uppercase tracking-wider font-medium">
                        Powered by Tether WDK
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
                        <span>Self-custodial — agent keys never leave the device</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
                        <span>BIP39 seed phrase recovery for full wallet portability</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
                        <span>Automatic USDC revenue routing to Lockbox</span>
                      </li>
                    </ul>
                  </div>
                )}

                {/* Advanced section — Code Hash & TEE (collapsed) */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    Advanced options
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 mt-4 overflow-hidden"
                      >
                        <div>
                          <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                            <span className="flex items-center gap-1.5">
                              <FileCode className="w-3.5 h-3.5" />
                              Code Hash (SHA-256)
                              <span className="text-muted-foreground/60 italic normal-case">optional</span>
                            </span>
                          </label>
                          <Input
                            placeholder="0x..."
                            value={form.codeHash}
                            onChange={(e) => updateForm("codeHash", e.target.value)}
                            className="h-11 mono-text"
                          />
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Source code hash for on-chain verification. Boosts credit score by 10%.
                          </p>
                        </div>

                        {form.ecosystem === "independent" && (
                          <div className="space-y-4">
                            <div>
                              <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                  <Cpu className="w-3.5 h-3.5" />
                                  TEE Provider
                                  <span className="text-muted-foreground/60 italic normal-case">optional</span>
                                </span>
                              </label>
                              <Input
                                placeholder="e.g., Intel SGX, AWS Nitro"
                                value={form.teeProvider}
                                onChange={(e) => updateForm("teeProvider", e.target.value)}
                                className="h-11"
                              />
                            </div>
                            <div>
                              <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">TEE Attestation</label>
                              <Textarea
                                placeholder="Paste attestation report..."
                                value={form.teeAttestation}
                                onChange={(e) => updateForm("teeAttestation", e.target.value)}
                                className="font-mono text-xs min-h-[80px]"
                                rows={3}
                              />
                            </div>
                            <div className="p-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex items-start gap-2">
                              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground/50" />
                              <span>TEE attestation proves secure hardware execution. Optional but adds extra trust for independent agents.</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* ── STEP 3: Deploy & Go Live ────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5">
                {deployed ? (
                  <BorderBeam duration={6}>
                    <div className="text-center py-6 px-4">
                      <div className="w-14 h-14 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-7 h-7 text-success" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1 text-foreground">{form.name} is Live!</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
                        Registered on-chain via {ecoConfig.name}. Start building credit history now.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button variant="outline" onClick={() => navigate("/agents")} className="font-medium min-h-[44px] md:min-h-0">
                          <span className="flex items-center gap-2">View Agents <ArrowRight className="w-4 h-4" /></span>
                        </Button>
                        <Button onClick={() => navigate("/agents")} className="font-medium min-h-[44px] md:min-h-0">
                          <span className="flex items-center gap-2">View Agent Dashboard <ArrowRight className="w-4 h-4" /></span>
                        </Button>
                      </div>
                    </div>
                  </BorderBeam>
                ) : (
                  <>
                    {/* Review summary */}
                    <BorderBeam duration={6}>
                      <div className="text-center py-4 px-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Rocket className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1 text-foreground">Ready to Deploy</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          One transaction deploys everything. Your agent goes live immediately.
                        </p>
                      </div>
                    </BorderBeam>

                    <div className="divide-y divide-border rounded-lg bg-muted overflow-hidden">
                      {[
                        { label: "Ecosystem", value: ecoConfig.name, color: ecoConfig.color },
                        { label: "Agent Name", value: form.name },
                        { label: "Category", value: form.agentCategory },
                        { label: "Operator", value: activeAddress ? shortenAddress(activeAddress, 6) : "---" },
                        ...(needsToken && form.externalTokenAddress
                          ? [{ label: "Token", value: shortenAddress(form.externalTokenAddress, 6) }]
                          : []),
                        ...(form.ecosystem === "openclaw" && form.externalAgentId
                          ? [{ label: "Agent ID", value: form.externalAgentId }]
                          : []),
                        { label: "Smart Wallet", value: form.deploySmartWallet ? "Enabled" : "Disabled" },
                        ...(form.deploySmartWallet
                          ? [{ label: "Wallet Provider", value: "Tether WDK" }]
                          : []),
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between text-sm px-4 py-3">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className={`font-medium truncate ml-4 min-w-0 ${
                            item.label === "Smart Wallet" && form.deploySmartWallet
                              ? "text-sky-600 dark:text-sky-400"
                              : item.label === "Wallet Provider"
                                ? "text-teal-600 dark:text-teal-400"
                                : "text-foreground"
                          }`} style={item.label === "Ecosystem" && "color" in item ? { color: item.color as string } : undefined}>
                            {item.label === "Smart Wallet" && form.deploySmartWallet && (
                              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                            )}
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* What gets deployed */}
                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Contracts deployed</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          ERC-8004 Agent NFT
                        </div>
                        <div className="flex items-center gap-2 text-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          RevenueLockbox
                        </div>
                        <div className="flex items-center gap-2 text-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          AgentVault (ERC-4626)
                        </div>
                        {form.deploySmartWallet && (
                          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            <span className="flex items-center gap-1.5">
                              Tether WDK Wallet
                              <Shield className="w-3 h-3" />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* WDK badge in deploy step */}
                    {form.deploySmartWallet && (
                      <WDKBadge />
                    )}

                    <ClickSpark>
                      <Button
                        className="w-full font-semibold h-12 rounded-lg"
                        disabled={deploying}
                        onClick={handleDeploy}
                      >
                        <span className="flex items-center gap-2">
                          {deploying ? (
                            <>
                              <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                              Deploying Contracts...
                            </>
                          ) : (
                            <>
                              <Rocket className="w-4 h-4" />
                              Deploy Agent On-Chain
                            </>
                          )}
                        </span>
                      </Button>
                    </ClickSpark>
                  </>
                )}
              </div>
            )}

          </AnimatedContent>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {!(step === 3 && deployed) && (
        <div className="flex justify-between mt-6 gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="min-h-[48px] md:min-h-0 flex-1 md:flex-none"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {step < 3 && (
            <Button
              onClick={() => setStep(Math.min(3, step + 1))}
              disabled={!canProceed()}
              className="min-h-[48px] md:min-h-0 flex-1 md:flex-none font-semibold"
            >
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </motion.div>
  )
}
