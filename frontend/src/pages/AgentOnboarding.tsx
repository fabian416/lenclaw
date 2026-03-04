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
    // Simulate deployment
    await new Promise((r) => setTimeout(r, 2000))
    setDeploying(false)
    setDeployed(true)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mono-text mb-2">Register Agent</h1>
        <p className="text-muted-foreground text-sm">
          Onboard your AI agent to access revenue-backed credit lines
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              step === s.id
                ? "bg-primary/10 text-primary"
                : step > s.id
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}>
              <s.icon className="w-4 h-4" />
              <span className="text-xs mono-text font-medium hidden sm:inline">{s.title}</span>
              <span className="text-xs mono-text font-medium sm:hidden">{s.id}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mx-1 ${step > s.id ? "bg-emerald-400" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="data-card rounded-2xl border-primary/15">
        <CardHeader>
          <CardTitle className="mono-text flex items-center gap-2">
            {(() => { const StepIcon = STEPS[step - 1].icon; return <StepIcon className="w-5 h-5 text-primary" /> })()}
            {STEPS[step - 1].title}
          </CardTitle>
          <CardDescription>{STEPS[step - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Connect Wallet */}
          {step === 1 && (
            <div className="space-y-6">
              {isConnected ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <div>
                    <div className="text-sm font-medium">Wallet Connected</div>
                    <div className="text-xs mono-text text-muted-foreground">{shortenAddress(address!, 8)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Connect the wallet that will operate this AI agent
                  </p>
                  <Button onClick={() => connect({ connector: injected() })} className="mono-text">
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
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">Agent Name</label>
                <Input
                  placeholder="e.g., AutoTrader-v3"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className="mono-text"
                />
              </div>
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">Description</label>
                <Textarea
                  placeholder="Describe what your agent does and how it generates revenue..."
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  className="mono-text"
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    Code Hash (SHA-256)
                  </span>
                </label>
                <Input
                  placeholder="0x..."
                  value={form.codeHash}
                  onChange={(e) => updateForm("codeHash", e.target.value)}
                  className="mono-text"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Hash of the agent's source code for on-chain verification
                </p>
              </div>
            </div>
          )}

          {/* Step 3: TEE Attestation */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    TEE Provider
                  </span>
                </label>
                <Input
                  placeholder="e.g., Intel SGX, AWS Nitro, ARM TrustZone"
                  value={form.teeProvider}
                  onChange={(e) => updateForm("teeProvider", e.target.value)}
                  className="mono-text"
                />
              </div>
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">Attestation Data</label>
                <Textarea
                  placeholder="Paste your TEE attestation report..."
                  value={form.teeAttestation}
                  onChange={(e) => updateForm("teeAttestation", e.target.value)}
                  className="mono-text font-mono text-xs"
                  rows={6}
                />
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                TEE attestation proves your agent runs in a secure enclave, ensuring code integrity and preventing tampering.
              </div>
            </div>
          )}

          {/* Step 4: Deploy Lockbox */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <h4 className="text-sm font-medium mono-text mb-2">RevenueLockbox Contract</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The RevenueLockbox is a smart contract that receives all revenue generated by your agent.
                  Lenders have priority claims on this revenue, ensuring trustless repayment of credit lines.
                </p>
              </div>

              {deployed ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <div>
                    <div className="text-sm font-medium">Lockbox Deployed</div>
                    <div className="text-xs mono-text text-muted-foreground">
                      0x7a23...4f8b (Base Sepolia)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Button
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="mono-text"
                  >
                    {deploying ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Deploying...
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
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Ready to Activate</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Your agent is fully configured. Activate to register on-chain and start building credit history.
                </p>
              </div>

              <div className="space-y-2 p-4 rounded-xl bg-muted/50 border border-border">
                <div className="flex justify-between text-xs mono-text">
                  <span className="text-muted-foreground">Agent Name</span>
                  <span className="text-foreground">{form.name}</span>
                </div>
                <div className="flex justify-between text-xs mono-text">
                  <span className="text-muted-foreground">Operator</span>
                  <span className="text-foreground">{address ? shortenAddress(address, 6) : "---"}</span>
                </div>
                <div className="flex justify-between text-xs mono-text">
                  <span className="text-muted-foreground">TEE Provider</span>
                  <span className="text-foreground">{form.teeProvider}</span>
                </div>
                <div className="flex justify-between text-xs mono-text">
                  <span className="text-muted-foreground">Lockbox</span>
                  <span className="text-emerald-400">Deployed</span>
                </div>
              </div>

              <Button className="w-full mono-text font-semibold h-11">
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Activate Agent On-Chain
                </span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="mono-text"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        {step < 5 && (
          <Button
            onClick={() => setStep(Math.min(5, step + 1))}
            disabled={!canProceed()}
            className="mono-text"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
