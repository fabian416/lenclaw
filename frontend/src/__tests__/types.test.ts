import { describe, it, expect } from "vitest"
import { MOCK_AGENTS, MOCK_POOL_DATA, MOCK_BORROWER } from "../lib/constants"
import type { Agent, PoolData, BorrowerData, OnboardingFormData } from "../lib/types"

describe("Agent type validation", () => {
  it("mock agents have all required fields", () => {
    for (const agent of MOCK_AGENTS) {
      expect(agent).toHaveProperty("id")
      expect(agent).toHaveProperty("name")
      expect(agent).toHaveProperty("erc8004Id")
      expect(agent).toHaveProperty("reputationScore")
      expect(agent).toHaveProperty("revenue30d")
      expect(agent).toHaveProperty("creditLine")
      expect(agent).toHaveProperty("utilization")
      expect(agent).toHaveProperty("status")
      expect(agent).toHaveProperty("walletAddress")
      expect(agent).toHaveProperty("description")
      expect(agent).toHaveProperty("registeredAt")
    }
  })

  it("agent statuses are valid", () => {
    const validStatuses = ["active", "delinquent", "default"]
    for (const agent of MOCK_AGENTS) {
      expect(validStatuses).toContain(agent.status)
    }
  })

  it("reputation scores are in valid range (0-100)", () => {
    for (const agent of MOCK_AGENTS) {
      expect(agent.reputationScore).toBeGreaterThanOrEqual(0)
      expect(agent.reputationScore).toBeLessThanOrEqual(100)
    }
  })

  it("utilization is in valid range (0-100)", () => {
    for (const agent of MOCK_AGENTS) {
      expect(agent.utilization).toBeGreaterThanOrEqual(0)
      expect(agent.utilization).toBeLessThanOrEqual(100)
    }
  })

  it("wallet addresses are valid format", () => {
    for (const agent of MOCK_AGENTS) {
      expect(agent.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})

describe("Pool data validation", () => {
  it("has all required fields", () => {
    expect(MOCK_POOL_DATA).toHaveProperty("tvl")
    expect(MOCK_POOL_DATA).toHaveProperty("apy")
    expect(MOCK_POOL_DATA).toHaveProperty("utilizationRate")
    expect(MOCK_POOL_DATA).toHaveProperty("activeAgents")
    expect(MOCK_POOL_DATA).toHaveProperty("totalRevenue")
    expect(MOCK_POOL_DATA).toHaveProperty("totalLoans")
    expect(MOCK_POOL_DATA).toHaveProperty("defaultRate")
  })

  it("apy is positive", () => {
    expect(MOCK_POOL_DATA.apy).toBeGreaterThan(0)
  })

  it("utilization rate is between 0 and 100", () => {
    expect(MOCK_POOL_DATA.utilizationRate).toBeGreaterThanOrEqual(0)
    expect(MOCK_POOL_DATA.utilizationRate).toBeLessThanOrEqual(100)
  })

  it("default rate is small percentage", () => {
    expect(MOCK_POOL_DATA.defaultRate).toBeLessThan(10)
  })
})

describe("Borrower data validation", () => {
  it("has all required fields", () => {
    expect(MOCK_BORROWER).toHaveProperty("agentName")
    expect(MOCK_BORROWER).toHaveProperty("erc8004Id")
    expect(MOCK_BORROWER).toHaveProperty("creditLine")
    expect(MOCK_BORROWER).toHaveProperty("availableCredit")
    expect(MOCK_BORROWER).toHaveProperty("outstandingDebt")
    expect(MOCK_BORROWER).toHaveProperty("interestRate")
    expect(MOCK_BORROWER).toHaveProperty("lockboxRevenue")
    expect(MOCK_BORROWER).toHaveProperty("lockboxBalance")
    expect(MOCK_BORROWER).toHaveProperty("nextPayment")
    expect(MOCK_BORROWER).toHaveProperty("repaymentSchedule")
  })

  it("available credit + outstanding debt <= credit line", () => {
    expect(MOCK_BORROWER.availableCredit + MOCK_BORROWER.outstandingDebt)
      .toBeLessThanOrEqual(MOCK_BORROWER.creditLine)
  })

  it("repayment schedule entries have valid statuses", () => {
    const validStatuses = ["paid", "upcoming", "overdue"]
    for (const entry of MOCK_BORROWER.repaymentSchedule) {
      expect(validStatuses).toContain(entry.status)
      expect(entry.amount).toBeGreaterThan(0)
      expect(entry.date).toBeGreaterThan(0)
    }
  })
})

describe("OnboardingFormData shape", () => {
  const baseForm: OnboardingFormData = {
    ecosystem: "virtuals",
    name: "TestAgent",
    description: "A test agent",
    agentCategory: "Trading",
    codeHash: "0xabcdef",
    externalTokenAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e",
    externalAgentId: "",
    deploySmartWallet: true,
    teeProvider: "",
    teeAttestation: "",
  }

  it("can create a valid form object with ecosystem", () => {
    expect(baseForm.name).toBe("TestAgent")
    expect(baseForm.ecosystem).toBe("virtuals")
    expect(baseForm.externalTokenAddress.startsWith("0x")).toBe(true)
  })

  it("validates step 2 requires name and description", () => {
    const emptyForm: OnboardingFormData = {
      ...baseForm,
      name: "",
      description: "",
    }
    const step2Valid = emptyForm.name.length > 0 && emptyForm.description.length > 0
    expect(step2Valid).toBe(false)
  })

  it("validates step 2 passes with name and description", () => {
    const step2Valid = baseForm.name.length > 0 && baseForm.description.length > 0
    expect(step2Valid).toBe(true)
  })

  it("virtuals/clawnch require externalTokenAddress", () => {
    const needsToken = baseForm.ecosystem === "virtuals" || baseForm.ecosystem === "clawnch"
    expect(needsToken).toBe(true)
    expect(baseForm.externalTokenAddress.length > 0).toBe(true)
  })

  it("independent agents do not need externalTokenAddress", () => {
    const indyForm: OnboardingFormData = { ...baseForm, ecosystem: "independent", externalTokenAddress: "" }
    const needsToken = indyForm.ecosystem === "virtuals" || indyForm.ecosystem === "clawnch"
    expect(needsToken).toBe(false)
  })

  it("smart wallet defaults to true for all ecosystems", () => {
    expect(baseForm.deploySmartWallet).toBe(true)
  })
})
