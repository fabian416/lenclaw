/**
 * In-memory store for agents created during the current session.
 * After registration, agents appear immediately in the marketplace.
 */

import { useState, useEffect, useCallback } from "react"

export interface NewAgent {
  id: number
  name: string
  description: string
  walletAddress: string
  agentCategory: string
  ecosystem: string
  registeredAt: number
  txHash: string
  reputationScore: number
  hasSmartWallet: boolean
}

// Module-level store
let _agents: NewAgent[] = []
const _listeners = new Set<() => void>()

export function addNewAgent(agent: NewAgent) {
  _agents = [..._agents, agent]
  _listeners.forEach((fn) => fn())
}

export function getNewAgents(): NewAgent[] {
  return _agents
}

/** Hook that re-renders when a new agent is added */
export function useNewAgents(): NewAgent[] {
  const [, setTick] = useState(0)

  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  }, [])

  return _agents
}
