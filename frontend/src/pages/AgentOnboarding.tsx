import { useState } from "react"
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
  { id: 3, title: "TEE Attestation", icon: Shield, description: "Provide TEE provider and attestation" },
  { id: 4, title: "Deploy Lockbox", icon: Lock, description: "Deploy the RevenueLockbox contract" },
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
  })

  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)

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

            {/* Step 3: TEE Attestation */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      TEE Provider
                    </span>
                  </label>
                  <Input
                    placeholder="e.g., Intel SGX, AWS Nitro, ARM TrustZone"
                    value={form.teeProvider}
                    onChange={(e) => updateForm("teeProvider", e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="text-xs md:text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Attestation Data</label>
                  <Textarea
                    placeholder="Paste your TEE attestation report..."
                    value={form.teeAttestation}
                    onChange={(e) => updateForm("teeAttestation", e.target.value)}
                    className="font-mono text-xs sm:text-sm min-h-[120px]"
                    rows={6}
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex items-start gap-2">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary/50" />
                  <span>TEE attestation proves your agent runs in a secure enclave, ensuring code integrity and preventing tampering.</span>
                </div>
              </div>
            )}

            {/* Step 4: Deploy Lockbox */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="p-4 rounded-lg bg-muted border border-border">
                  <div className="flex items-start gap-3">
                    <Lock className="w-4 h-4 text-primary/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-foreground">RevenueLockbox Contract</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        The RevenueLockbox receives all revenue generated by your agent.
                        Lenders have priority claims on this revenue, ensuring trustless repayment.
                      </p>
                    </div>
                  </div>
                </div>

                {deployed ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/[0.06] border border-primary/20">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">Lockbox Deployed</div>
                      <div className="text-xs text-muted-foreground mono-text truncate">0x7a23...4f8b (Base Sepolia)</div>
                    </div>
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
                        { label: "TEE Provider", value: form.teeProvider },
                        { label: "Lockbox", value: "Deployed" },
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between text-sm px-4 py-3">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium truncate ml-4 text-foreground min-w-0">{item.value}</span>
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
