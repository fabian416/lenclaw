import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Wallet,
  Bot,
  Shield,
  Lock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Cpu,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useAccount, useConnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { shortenAddress } from "@/lib/utils"
import type { OnboardingFormData } from "@/lib/types"

const STEPS = [
  { id: 1, title: "Connect Wallet", icon: Wallet, description: "Link the agent's operator wallet" },
  { id: 2, title: "Agent Details", icon: Bot, description: "Name, description, and code hash" },
  { id: 3, title: "TEE Attestation", icon: Shield, description: "Provide TEE provider and attestation" },
  { id: 4, title: "Deploy Lockbox", icon: Lock, description: "Deploy the RevenueLockbox contract" },
  { id: 5, title: "Activate", icon: CheckCircle2, description: "Finalize and activate agent" },
]

export default function AgentOnboarding() {
  const [step, setStep] = useState(1)
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()

  const [form, setForm] = useState<OnboardingFormData>({
    name: "",
    description: "",
    codeHash: "",
    teeProvider: "",
    teeAttestation: "",
  })

  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)

  const updateForm = (field: keyof OnboardingFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const canProceed = () => {
    switch (step) {
      case 1: return isConnected
      case 2: return form.name.length > 0 && form.description.length > 0 && form.codeHash.length > 0
      case 3: return form.teeProvider.length > 0 && form.teeAttestation.length > 0
      case 4: return deployed
      case 5: return true
      default: return false
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    await new Promise((r) => setTimeout(r, 2000))
    setDeploying(false)
    setDeployed(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 md:mb-8"
      >
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mono-text mb-1.5 md:mb-2">Register Agent</h1>
        <p className="text-muted-foreground text-xs md:text-sm">
          Onboard your AI agent to access revenue-backed credit lines
        </p>
      </motion.div>

      {/* Step Indicator - Desktop: connected dots with animated progress */}
      <div className="hidden md:flex items-center gap-0 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 whitespace-nowrap relative ${
                step === s.id
                  ? "bg-gradient-to-r from-violet-500/15 to-purple-500/10 text-primary border border-primary/20"
                  : step > s.id
                    ? "text-emerald-400"
                    : "text-muted-foreground"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step > s.id
                  ? "bg-emerald-400/20 text-emerald-400"
                  : step === s.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/50 text-muted-foreground"
              }`}>
                {step > s.id ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <s.icon className="w-3.5 h-3.5" />
                )}
              </div>
              <span className="text-xs mono-text font-medium">{s.title}</span>
            </motion.div>
            {i < STEPS.length - 1 && (
              <div className="relative w-8 h-px mx-0.5">
                <div className="absolute inset-0 bg-border" />
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-300"
                  initial={{ width: 0 }}
                  animate={{ width: step > s.id ? "100%" : "0%" }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step Indicator - Mobile: dot indicators with animated progress */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          {STEPS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <motion.div
                animate={{
                  width: step === s.id ? 24 : 8,
                  backgroundColor: step > s.id ? "#10b981" : step === s.id ? "#8b5cf6" : "rgba(139,92,246,0.2)",
                }}
                transition={{ duration: 0.3 }}
                className="h-2 rounded-full"
              />
            </div>
          ))}
        </div>
        <div className="text-center">
          <div className="text-xs mono-text text-muted-foreground">
            Step {step} of {STEPS.length}
          </div>
          <div className="text-sm font-semibold mono-text text-primary mt-0.5">
            {STEPS[step - 1].title}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <Card className="data-card rounded-2xl border-primary/15">
        <CardHeader>
          <CardTitle className="mono-text flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center">
              {(() => { const StepIcon = STEPS[step - 1].icon; return <StepIcon className="w-4 h-4 text-primary" /> })()}
            </div>
            {STEPS[step - 1].title}
          </CardTitle>
          <CardDescription>{STEPS[step - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Step 1: Connect Wallet */}
              {step === 1 && (
                <div className="space-y-6">
                  {isConnected ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                      >
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                      </motion.div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">Wallet Connected</div>
                        <div className="text-xs mono-text text-muted-foreground truncate">{shortenAddress(address!, 8)}</div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center py-6 md:py-8">
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                      >
                        <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                      </motion.div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Connect the wallet that will operate this AI agent
                      </p>
                      <Button
                        onClick={() => connect({ connector: injected() })}
                        className="mono-text min-h-[48px] w-full md:w-auto bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
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
                <div className="space-y-5 md:space-y-4">
                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 md:mb-1.5 block">Agent Name</label>
                    <Input
                      placeholder="e.g., AutoTrader-v3"
                      value={form.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      className="mono-text h-12 md:h-10 border-primary/10 focus:border-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 md:mb-1.5 block">Description</label>
                    <Textarea
                      placeholder="Describe what your agent does and how it generates revenue..."
                      value={form.description}
                      onChange={(e) => updateForm("description", e.target.value)}
                      className="mono-text min-h-[120px] md:min-h-0 border-primary/10 focus:border-primary/30 transition-colors"
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 md:mb-1.5 block">
                      <span className="flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5" />
                        Code Hash (SHA-256)
                      </span>
                    </label>
                    <Input
                      placeholder="0x..."
                      value={form.codeHash}
                      onChange={(e) => updateForm("codeHash", e.target.value)}
                      className="mono-text h-12 md:h-10 border-primary/10 focus:border-primary/30 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Hash of the agent's source code for on-chain verification
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: TEE Attestation */}
              {step === 3 && (
                <div className="space-y-5 md:space-y-4">
                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 md:mb-1.5 block">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        TEE Provider
                      </span>
                    </label>
                    <Input
                      placeholder="e.g., Intel SGX, AWS Nitro, ARM TrustZone"
                      value={form.teeProvider}
                      onChange={(e) => updateForm("teeProvider", e.target.value)}
                      className="mono-text h-12 md:h-10 border-primary/10 focus:border-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 md:mb-1.5 block">Attestation Data</label>
                    <Textarea
                      placeholder="Paste your TEE attestation report..."
                      value={form.teeAttestation}
                      onChange={(e) => updateForm("teeAttestation", e.target.value)}
                      className="mono-text font-mono text-xs min-h-[140px] md:min-h-0 border-primary/10 focus:border-primary/30 transition-colors"
                      rows={6}
                    />
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-start gap-2">
                    <Shield className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
                    <span>TEE attestation proves your agent runs in a secure enclave, ensuring code integrity and preventing tampering.</span>
                  </div>
                </div>
              )}

              {/* Step 4: Deploy Lockbox */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center flex-shrink-0">
                        <Lock className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mono-text mb-1">RevenueLockbox Contract</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The RevenueLockbox is a smart contract that receives all revenue generated by your agent.
                          Lenders have priority claims on this revenue, ensuring trustless repayment of credit lines.
                        </p>
                      </div>
                    </div>
                  </div>

                  {deployed ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                      >
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                      </motion.div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">Lockbox Deployed</div>
                        <div className="text-xs mono-text text-muted-foreground truncate">
                          0x7a23...4f8b (Base Sepolia)
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center py-4">
                      <Button
                        onClick={handleDeploy}
                        disabled={deploying}
                        className="mono-text min-h-[48px] w-full md:w-auto bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                      >
                        {deploying ? (
                          <span className="flex items-center gap-2">
                            <motion.span
                              className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                            Deploying Contract...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Deploy RevenueLockbox
                          </span>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 5: Activate */}
              {step === 5 && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-400/5 flex items-center justify-center mx-auto mb-4"
                    >
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </motion.div>
                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-lg font-semibold mb-2"
                    >
                      Ready to Activate
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-sm text-muted-foreground max-w-sm mx-auto"
                    >
                      Your agent is fully configured. Activate to register on-chain and start building credit history.
                    </motion.p>
                  </div>

                  <div className="space-y-2 p-4 rounded-xl bg-muted/30 border border-border/50">
                    {[
                      { label: "Agent Name", value: form.name },
                      { label: "Operator", value: address ? shortenAddress(address, 6) : "---" },
                      { label: "TEE Provider", value: form.teeProvider },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.08 }}
                        className="flex justify-between text-xs mono-text py-1"
                      >
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="text-foreground truncate ml-4">{item.value}</span>
                      </motion.div>
                    ))}
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.54 }}
                      className="flex justify-between text-xs mono-text py-1"
                    >
                      <span className="text-muted-foreground">Lockbox</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        Deployed
                      </span>
                    </motion.div>
                  </div>

                  <Button className="w-full mono-text font-semibold h-12 md:h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Activate Agent On-Chain
                    </span>
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-5 md:mt-6 gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="mono-text min-h-[48px] md:min-h-0 flex-1 md:flex-none hover:bg-primary/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        {step < 5 && (
          <Button
            onClick={() => setStep(Math.min(5, step + 1))}
            disabled={!canProceed()}
            className="mono-text min-h-[48px] md:min-h-0 flex-1 md:flex-none bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-muted disabled:to-muted"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}
