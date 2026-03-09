import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Wallet,
  Bot,
  Shield,
  ShieldCheck,
  Lock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Cpu,
  Rocket,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useAccount, useConnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"
import type { OnboardingFormData } from "@/lib/types"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { ClickSpark } from "@/components/reactbits/ClickSpark"
import { BorderBeam } from "@/components/reactbits/BorderBeam"

const STEPS = [
  { id: 1, title: "Connect Wallet", icon: Wallet, description: "Link the agent's operator wallet" },
  { id: 2, title: "Agent Details", icon: Bot, description: "Name, description, and code hash" },
  { id: 3, title: "Trust & Verification", icon: ShieldCheck, description: "Smart Wallet and optional TEE attestation" },
  { id: 4, title: "Deploy", icon: Rocket, description: "Deploy Lockbox and Smart Wallet contracts" },
  { id: 5, title: "Activate", icon: CheckCircle2, description: "Finalize and activate agent" },
]

export default function AgentOnboarding() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()

  const [form, setForm] = useState<OnboardingFormData>({
    name: "",
    description: "",
    codeHash: "",
    teeProvider: "",
    teeAttestation: "",
    deploySmartWallet: true,
  })

  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)

  const updateForm = <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const canProceed = () => {
    switch (step) {
      case 1: return isConnected
      case 2: return form.name.length > 0 && form.description.length > 0 && form.codeHash.length > 0
      case 3: return true // TEE is optional, smart wallet is a toggle
      case 4: return deployed
      case 5: return true
      default: return false
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    await new Promise((r) => setTimeout(r, form.deploySmartWallet ? 3000 : 2000))
    setDeploying(false)
    setDeployed(true)
  }

  const handleActivate = async () => {
    setActivating(true)
    await new Promise((r) => setTimeout(r, 2500))
    setActivating(false)
    setActivated(true)
  }

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

      {/* Step Indicator -- Desktop: numbered steps */}
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
                {step > s.id ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  s.id
                )}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${
                step >= s.id ? "text-foreground" : "text-muted-foreground"
              }`}>
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
            {/* Step 1: Connect Wallet */}
            {step === 1 && (
              <div className="space-y-4">
                {isConnected ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/[0.06] border border-primary/20">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">Wallet Connected</div>
                      <div className="text-xs text-muted-foreground mono-text truncate">{shortenAddress(address!, 8)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Wallet className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground mb-5">
                      Connect the wallet that will operate this AI agent
                    </p>
                    <Button
                      onClick={() => connect({ connector: injected() })}
                      className="min-h-[48px] w-full md:w-auto font-semibold"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      Connect Wallet
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Agent Details */}
            {step === 2 && (
              <div className="space-y-4">
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
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5" />
                      Code Hash (SHA-256)
                    </span>
                  </label>
                  <Input
                    placeholder="0x..."
                    value={form.codeHash}
                    onChange={(e) => updateForm("codeHash", e.target.value)}
                    className="h-11 mono-text"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Hash of the agent's source code for on-chain verification
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Trust & Verification */}
            {step === 3 && (
              <div className="space-y-5">
                {/* Smart Wallet — primary trust mechanism */}
                <div>
                  <button
                    onClick={() => updateForm("deploySmartWallet", !form.deploySmartWallet)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      form.deploySmartWallet
                        ? "border-sky-400 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-500/60"
                        : "border-border bg-card hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        form.deploySmartWallet
                          ? "bg-sky-100 dark:bg-sky-800/40"
                          : "bg-muted"
                      }`}>
                        <ShieldCheck className={`w-5 h-5 ${
                          form.deploySmartWallet ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">Deploy Smart Wallet</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Smart Wallet auto-routes all USDC revenue to the RevenueLockbox, ensuring trustless repayment without manual intervention. Agents with Smart Wallet get the highest trust score and better credit terms.
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        form.deploySmartWallet
                          ? "border-sky-500 bg-sky-500"
                          : "border-muted-foreground/40"
                      }`}>
                        {form.deploySmartWallet && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                  </button>
                </div>

                {form.deploySmartWallet && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-3 gap-3"
                  >
                    <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/15 border border-sky-200/60 dark:border-sky-500/20 text-center">
                      <div className="text-lg font-bold text-sky-600 dark:text-sky-400">+15%</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit Score</div>
                    </div>
                    <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/15 border border-sky-200/60 dark:border-sky-500/20 text-center">
                      <div className="text-lg font-bold text-sky-600 dark:text-sky-400">Auto</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Repayments</div>
                    </div>
                    <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/15 border border-sky-200/60 dark:border-sky-500/20 text-center">
                      <div className="text-lg font-bold text-sky-600 dark:text-sky-400">Max</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust Tier</div>
                    </div>
                  </motion.div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Optional</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* TEE Attestation — optional */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">TEE Attestation</span>
                    <span className="text-[10px] text-muted-foreground/70 italic">optional</span>
                  </div>
                  <Input
                    placeholder="e.g., Intel SGX, AWS Nitro, ARM TrustZone"
                    value={form.teeProvider}
                    onChange={(e) => updateForm("teeProvider", e.target.value)}
                    className="h-11"
                  />
                  <Textarea
                    placeholder="Paste your TEE attestation report..."
                    value={form.teeAttestation}
                    onChange={(e) => updateForm("teeAttestation", e.target.value)}
                    className="font-mono text-xs sm:text-sm min-h-[80px]"
                    rows={3}
                  />
                  <div className="p-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex items-start gap-2">
                    <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground/50" />
                    <span>TEE attestation proves your agent runs in a secure hardware enclave. This is optional but adds an extra layer of trust.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Deploy */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  {/* Lockbox — always deployed */}
                  <div className="p-4 rounded-lg bg-muted border border-border">
                    <div className="flex items-start gap-3">
                      <Lock className="w-4 h-4 text-primary/50 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium mb-1 text-foreground">RevenueLockbox</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Receives all revenue from your agent. Lenders have priority claims for trustless repayment.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Smart Wallet — if selected */}
                  {form.deploySmartWallet && (
                    <div className="p-4 rounded-lg bg-sky-50 dark:bg-sky-900/15 border border-sky-200 dark:border-sky-500/30">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium mb-1 text-foreground">Smart Wallet</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Auto-routes USDC revenue to lockbox. Highest trust tier for backers.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {deployed ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/[0.06] border border-primary/20">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">Lockbox Deployed</div>
                        <div className="text-xs text-muted-foreground mono-text truncate">0x7a23...4f8b (Base Sepolia)</div>
                      </div>
                    </div>
                    {form.deploySmartWallet && (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-sky-50 dark:bg-sky-900/15 border border-sky-200 dark:border-sky-500/30">
                        <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">Smart Wallet Deployed</div>
                          <div className="text-xs text-muted-foreground mono-text truncate">0x9c41...2d7a (Base Sepolia)</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="min-h-[48px] w-full md:w-auto font-semibold"
                    >
                      {deploying ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                          Deploying Contracts...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Rocket className="w-4 h-4" />
                          Deploy {form.deploySmartWallet ? "Lockbox + Smart Wallet" : "Lockbox"}
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Activate */}
            {step === 5 && (
              <div className="space-y-5">
                {activated ? (
                  <BorderBeam duration={6}>
                    <div className="text-center py-6 px-4">
                      <div className="w-14 h-14 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-7 h-7 text-success" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1 text-foreground">Agent Activated!</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
                        {form.name} is now registered on-chain and ready to start building credit history.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => navigate("/agents")}
                        className="font-medium min-h-[44px] md:min-h-0"
                      >
                        <span className="flex items-center gap-2">
                          View All Agents
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </Button>
                    </div>
                  </BorderBeam>
                ) : (
                  <>
                    <BorderBeam duration={6}>
                      <div className="text-center py-4 px-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1 text-foreground">Ready to Activate</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          Your agent is configured. Activate to register on-chain and start building credit history.
                        </p>
                      </div>
                    </BorderBeam>

                    <div className="divide-y divide-border rounded-lg bg-muted overflow-hidden">
                      {[
                        { label: "Agent Name", value: form.name },
                        { label: "Operator", value: address ? shortenAddress(address, 6) : "---" },
                        { label: "Smart Wallet", value: form.deploySmartWallet ? "Enabled" : "No" },
                        { label: "TEE Provider", value: form.teeProvider || "Not provided" },
                        { label: "Lockbox", value: "Deployed" },
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between text-sm px-4 py-3">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className={`font-medium truncate ml-4 min-w-0 ${
                            item.label === "Smart Wallet" && form.deploySmartWallet
                              ? "text-sky-600 dark:text-sky-400"
                              : "text-foreground"
                          }`}>
                            {item.label === "Smart Wallet" && form.deploySmartWallet && (
                              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                            )}
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    <ClickSpark>
                      <Button
                        className="w-full font-semibold h-12 rounded-lg"
                        disabled={activating}
                        onClick={handleActivate}
                      >
                        <span className="flex items-center gap-2">
                          {activating ? (
                            <>
                              <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                              Activating...
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" />
                              Activate Agent On-Chain
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
      <div className="flex justify-between mt-6 gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="min-h-[48px] md:min-h-0 flex-1 md:flex-none"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        {step < 5 && (
          <Button
            onClick={() => setStep(Math.min(5, step + 1))}
            disabled={!canProceed()}
            className="min-h-[48px] md:min-h-0 flex-1 md:flex-none font-semibold"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}
