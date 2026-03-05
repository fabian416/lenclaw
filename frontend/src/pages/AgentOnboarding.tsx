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
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto px-6 py-8 md:py-12"
    >
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-white">Register Agent</h1>
        <p className="text-white/50 text-sm">
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
                  ? "bg-[#14f195] text-black border-[#14f195]"
                  : step === s.id
                    ? "border-[#14f195] text-[#14f195]"
                    : "border-white/20 text-white/30"
              }`}>
                {step > s.id ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  s.id
                )}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${
                step >= s.id ? "text-white" : "text-white/30"
              }`}>
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px mx-2">
                <div className={`h-full ${step > s.id ? "bg-[#14f195]" : "bg-white/10"}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step Indicator -- Mobile */}
      <div className="md:hidden mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/40">Step {step} of {STEPS.length}</span>
          <span className="text-sm font-medium text-white">{STEPS[step - 1].title}</span>
        </div>
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#14f195] rounded-full"
            animate={{ width: `${(step / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
            {(() => { const StepIcon = STEPS[step - 1].icon; return <StepIcon className="w-4 h-4 text-[#14f195]/60" /> })()}
            {STEPS[step - 1].title}
          </h2>
          <p className="text-sm text-white/50 mt-1">{STEPS[step - 1].description}</p>
        </div>

        <AnimatePresence mode="wait">
          <AnimatedContent key={step} direction="right" distance={12}>
            {/* Step 1: Connect Wallet */}
            {step === 1 && (
              <div className="space-y-4">
                {isConnected ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-[#14f195]/[0.06] border border-[#14f195]/20">
                    <CheckCircle2 className="w-5 h-5 text-[#14f195] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">Wallet Connected</div>
                      <div className="text-xs text-white/40 mono-text truncate">{shortenAddress(address!, 8)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Wallet className="w-10 h-10 text-white/20 mx-auto mb-4" />
                    <p className="text-sm text-white/50 mb-5">
                      Connect the wallet that will operate this AI agent
                    </p>
                    <Button
                      onClick={() => connect({ connector: injected() })}
                      className="min-h-[48px] w-full md:w-auto bg-[#14f195] text-black font-semibold hover:bg-[#14f195]/90"
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
                  <label className="text-[10px] text-white/40 mb-1.5 block uppercase tracking-wider">Agent Name</label>
                  <Input
                    placeholder="e.g., AutoTrader-v3"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1.5 block uppercase tracking-wider">Description</label>
                  <Textarea
                    placeholder="Describe what your agent does and how it generates revenue..."
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                    rows={4}
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1.5 block uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5" />
                      Code Hash (SHA-256)
                    </span>
                  </label>
                  <Input
                    placeholder="0x..."
                    value={form.codeHash}
                    onChange={(e) => updateForm("codeHash", e.target.value)}
                    className="h-11 mono-text bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                  <p className="text-xs text-white/30 mt-1.5">
                    Hash of the agent's source code for on-chain verification
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: TEE Attestation */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-white/40 mb-1.5 block uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      TEE Provider
                    </span>
                  </label>
                  <Input
                    placeholder="e.g., Intel SGX, AWS Nitro, ARM TrustZone"
                    value={form.teeProvider}
                    onChange={(e) => updateForm("teeProvider", e.target.value)}
                    className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1.5 block uppercase tracking-wider">Attestation Data</label>
                  <Textarea
                    placeholder="Paste your TEE attestation report..."
                    value={form.teeAttestation}
                    onChange={(e) => updateForm("teeAttestation", e.target.value)}
                    className="font-mono text-xs bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                    rows={6}
                  />
                </div>
                <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/40 flex items-start gap-2">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#14f195]/50" />
                  <span>TEE attestation proves your agent runs in a secure enclave, ensuring code integrity and preventing tampering.</span>
                </div>
              </div>
            )}

            {/* Step 4: Deploy Lockbox */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <div className="flex items-start gap-3">
                    <Lock className="w-4 h-4 text-[#14f195]/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium mb-1 text-white">RevenueLockbox Contract</h4>
                      <p className="text-xs text-white/40 leading-relaxed">
                        The RevenueLockbox receives all revenue generated by your agent.
                        Lenders have priority claims on this revenue, ensuring trustless repayment.
                      </p>
                    </div>
                  </div>
                </div>

                {deployed ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-[#14f195]/[0.06] border border-[#14f195]/20">
                    <CheckCircle2 className="w-5 h-5 text-[#14f195] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">Lockbox Deployed</div>
                      <div className="text-xs text-white/40 mono-text truncate">0x7a23...4f8b (Base Sepolia)</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="min-h-[48px] w-full md:w-auto bg-[#14f195] text-black font-semibold hover:bg-[#14f195]/90"
                    >
                      {deploying ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
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
                <BorderBeam duration={6}>
                  <div className="text-center py-4 px-4">
                    <div className="w-12 h-12 rounded-full bg-[#14f195]/10 border border-[#14f195]/20 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-6 h-6 text-[#14f195]" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1 text-white">Ready to Activate</h3>
                    <p className="text-sm text-white/50 max-w-sm mx-auto">
                      Your agent is configured. Activate to register on-chain and start building credit history.
                    </p>
                  </div>
                </BorderBeam>

                <div className="divide-y divide-white/[0.06] rounded-lg bg-white/[0.04] overflow-hidden">
                  {[
                    { label: "Agent Name", value: form.name },
                    { label: "Operator", value: address ? shortenAddress(address, 6) : "---" },
                    { label: "TEE Provider", value: form.teeProvider },
                    { label: "Lockbox", value: "Deployed" },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between text-sm px-4 py-3">
                      <span className="text-white/50">{item.label}</span>
                      <span className="font-medium truncate ml-4 text-white">{item.value}</span>
                    </div>
                  ))}
                </div>

                <ClickSpark>
                  <Button className="w-full font-semibold h-12 bg-[#14f195] text-black hover:bg-[#14f195]/90 rounded-lg">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Activate Agent On-Chain
                    </span>
                  </Button>
                </ClickSpark>
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
          className="min-h-[48px] md:min-h-0 flex-1 md:flex-none text-white/50 hover:text-white hover:bg-white/[0.06]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        {step < 5 && (
          <Button
            onClick={() => setStep(Math.min(5, step + 1))}
            disabled={!canProceed()}
            className="min-h-[48px] md:min-h-0 flex-1 md:flex-none bg-[#14f195] text-black font-semibold hover:bg-[#14f195]/90"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}
