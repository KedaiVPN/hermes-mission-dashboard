// Agents are whatever Hermes profiles the machine reports (plus OpenCode), so nothing here is
// tied to particular names: each agent's look is derived from its id.

export interface AgentLook { hair: string; skin: string; shirt: string; pants: string }

const HAIR = ['#1d293c', '#b54b45', '#6a4d8d', '#3b2a20', '#c9a24a', '#2f4f3a', '#8b5a2b', '#11151c']
const SKIN = ['#e9b57d', '#c98e5a', '#f1c9a0', '#a8714a', '#dca06e']
const SHIRT = ['#e6b34e', '#70bdcb', '#93ca67', '#e76f51', '#8f7ae6', '#f4a3b4', '#4f9c7a', '#d9534f', '#5a8dee', '#c7a17a']
const PANTS = ['#36475d', '#374052', '#344349', '#4a3b2f', '#2f3a44', '#3d2f4a']

/** A small stable hash (FNV-1a) so an agent keeps the same look on every device. */
export function hashName(name: string): number {
  let hash = 2166136261
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function agentLook(id: string): AgentLook {
  const hash = hashName(id)
  return { hair: HAIR[hash % HAIR.length], skin: SKIN[(hash >>> 4) % SKIN.length], shirt: SHIRT[(hash >>> 8) % SHIRT.length], pants: PANTS[(hash >>> 12) % PANTS.length] }
}

export interface AgentKinetics {
  /** Walking speed in world units / sec (e.g. 2.1 to 3.1). */
  walkSpeed: number
  /** Leg/arm swing cycle frequency in rad/s (e.g. 8.5 to 11.5). */
  swingFreq: number
  /** Jitter multiplier for idle stop durations (e.g. 0.75 to 1.35). */
  durationScale: number
  /** Small offset to de-phase typing and breathing rhythms. */
  phase: number
}

export function agentKinetics(id: string): AgentKinetics {
  const hash = hashName(id)
  // Deterministic normalized values [0, 1)
  const v1 = ((hash >>> 16) & 0xff) / 255
  const v2 = ((hash >>> 8) & 0xff) / 255
  const v3 = (hash & 0xff) / 255
  return {
    walkSpeed: 2.1 + v1 * 1.0,          // Range: 2.1 - 3.1
    swingFreq: 8.5 + v2 * 3.0,          // Range: 8.5 - 11.5
    durationScale: 0.75 + v3 * 0.60,    // Range: 0.75 - 1.35 (e.g. 24s - 43s)
    phase: v1 * Math.PI * 2,
  }
}
