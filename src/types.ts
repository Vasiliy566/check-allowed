export type CheckStatus = 'ok' | 'fail' | 'timeout' | 'pending'

export type ProbeUsed = 'favicon' | 'robots' | 'faviconPng' | 'head' | 'fetch' | null

/** 1=blocked by company (e.g. ChatGPT), 2=blocked by Russia (RKN), 3=Russian-only (gosuslugi), 4=allowed/other */
export type DomainCategory = 'company_blocked' | 'blocked_by_russia' | 'russian_specific' | 'allowed'

export interface DomainCheckResult {
  domain: string
  category?: DomainCategory
  status: CheckStatus
  probeUsed: ProbeUsed
  latencyMs: number | null
  checkedAt: string // ISO
  details?: {
    favicon?: { status: CheckStatus; latencyMs: number | null }
    robots?: { status: CheckStatus; latencyMs: number | null }
    faviconPng?: { status: CheckStatus; latencyMs: number | null }
    head?: { status: CheckStatus; latencyMs: number | null }
    fetch?: { status: CheckStatus; latencyMs: number | null }
  }
}

export interface DomainSourcePreset {
  id: string
  label: string
  url: string
  category?: DomainCategory
}

export type HealthStatus = 'ok' | 'partial' | 'no-internet' | 'lists-unavailable'

export interface DiagnosticsState {
  controlExampleCom: CheckStatus | null
  controlWikipedia: CheckStatus | null
  controlRawGithub: CheckStatus | null
  listsLoaded: boolean
  usedFallbackList: boolean
  healthStatus: HealthStatus
  healthMessage: string
  okRatio: number
}

export interface RknSnapshot {
  domains?: string[]
  updatedAt?: string
  [key: string]: unknown
}

export interface RunStats {
  total: number
  ok: number
  fail: number
  timeout: number
  pending: number
  durationMs: number | null
  startedAt: string | null
}
