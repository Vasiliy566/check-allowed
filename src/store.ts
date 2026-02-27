import { ref, computed } from 'vue'
import type { DomainCheckResult, RunStats, DiagnosticsState, RknSnapshot, DomainCategory } from './types'
import { DOMAIN_SOURCE_PRESETS, DOMAIN_CATEGORY_SOURCES, loadDomainsForCategories } from './domainSources'

export { DOMAIN_CATEGORY_SOURCES }
import { loadDomainsFromPresetOrUrl } from './domainSources'
import { runChecks } from './runner'
import { checkDomain } from './probes'
import { computeDiagnostics, CONTROL_DOMAINS } from './diagnostics'

const DEFAULT_LIMIT = 120
const DEFAULT_CONCURRENCY = 15
const DEFAULT_TIMEOUT_MS = 6000
const DEFAULT_THRESHOLD = 85

export const DOMAIN_CATEGORIES: DomainCategory[] = ['company_blocked', 'blocked_by_russia', 'russian_specific', 'allowed']

export const presetSources = DOMAIN_SOURCE_PRESETS

/** When true (default), load from all 4 category sources; otherwise single preset. */
export const checkAllTypes = ref(true)
/** Which categories to include when checkAllTypes is true. Default: all 4. */
export const selectedCategories = ref<DomainCategory[]>(['company_blocked', 'blocked_by_russia', 'russian_specific', 'allowed'])

export const selectedPresetId = ref<string>(DOMAIN_SOURCE_PRESETS[0].id)
export const customSourceUrl = ref('')
export const domainLimit = ref<50 | 120 | 300>(DEFAULT_LIMIT)
export const concurrency = ref(DEFAULT_CONCURRENCY)
export const timeoutMs = ref(DEFAULT_TIMEOUT_MS)
export const okThresholdPercent = ref(DEFAULT_THRESHOLD)

export const results = ref<DomainCheckResult[]>([])
export const domainsToCheck = ref<string[]>([])
/** domain -> category when checkAllTypes was used */
export const domainCategoryMap = ref<Map<string, DomainCategory>>(new Map())
export const isRunning = ref(false)
export const isCancelled = ref(false)
export const progressDone = ref(0)
export const progressTotal = ref(0)
export const runStartTime = ref<number | null>(null)
export const controlResults = ref<Map<string, 'ok' | 'fail' | 'timeout'>>(new Map())
export const listsLoaded = ref(false)
export const usedFallbackList = ref(false)
export const rknSnapshot = ref<RknSnapshot | null>(null)

const cancelSignal = { cancelled: false }

export const runStats = computed<RunStats>(() => {
  const list = results.value
  const total = list.length
  const ok = list.filter((r) => r.status === 'ok').length
  const fail = list.filter((r) => r.status === 'fail').length
  const timeout = list.filter((r) => r.status === 'timeout').length
  const pending = list.filter((r) => r.status === 'pending').length
  const durationMs =
    runStartTime.value != null && (progressDone.value >= progressTotal.value || isCancelled.value)
      ? Math.round(performance.now() - runStartTime.value)
      : null
  return {
    total,
    ok,
    fail,
    timeout,
    pending,
    durationMs,
    startedAt: runStartTime.value != null ? new Date(runStartTime.value).toISOString() : null,
  }
})

export const diagnostics = computed<DiagnosticsState>(() => {
  return computeDiagnostics(
    controlResults.value,
    listsLoaded.value,
    usedFallbackList.value,
    results.value,
    okThresholdPercent.value / 100
  )
})

export const failedDomains = computed(() =>
  results.value.filter((r) => r.status === 'fail' || r.status === 'timeout')
)

export interface CategoryStats {
  category: DomainCategory
  label: string
  shortLabel: string
  ok: number
  fail: number
  timeout: number
  total: number
  done: number
}

export const resultsByCategory = computed<CategoryStats[]>(() => {
  const list = results.value
  return DOMAIN_CATEGORIES.map((category) => {
    const inCat = list.filter((r) => r.category === category)
    const ok = inCat.filter((r) => r.status === 'ok').length
    const fail = inCat.filter((r) => r.status === 'fail').length
    const timeout = inCat.filter((r) => r.status === 'timeout').length
    const done = ok + fail + timeout
    return {
      category,
      label: DOMAIN_CATEGORY_SOURCES[category].label,
      shortLabel: DOMAIN_CATEGORY_SOURCES[category].shortLabel,
      ok,
      fail,
      timeout,
      total: inCat.length,
      done,
    }
  })
})

/** Returns list of domains to check; uses selected categories (checkboxes). */
export async function loadDomainList(): Promise<string[]> {
  const limit = domainLimit.value
  const cats = selectedCategories.value.length > 0 ? selectedCategories.value : DOMAIN_CATEGORIES
  if (cats.length > 0) {
    const { list, usedFallback } = await loadDomainsForCategories(cats, limit)
    usedFallbackList.value = usedFallback
    listsLoaded.value = !usedFallback
    const map = new Map<string, DomainCategory>()
    for (const { domain, category } of list) map.set(domain, category)
    domainCategoryMap.value = map
    domainsToCheck.value = list.map((x) => x.domain)
    return domainsToCheck.value
  }
  const preset = DOMAIN_SOURCE_PRESETS.find((p) => p.id === selectedPresetId.value)
  const presetUrl = preset?.url ?? null
  const { domains, usedFallback } = await loadDomainsFromPresetOrUrl(presetUrl, customSourceUrl.value)
  usedFallbackList.value = usedFallback
  listsLoaded.value = !usedFallback
  domainCategoryMap.value = new Map()
  domainsToCheck.value = domains.slice(0, limit)
  return domainsToCheck.value
}

export async function runControlChecks(): Promise<void> {
  const controlList = [CONTROL_DOMAINS.primary, CONTROL_DOMAINS.rawGithub]
  const map = new Map<string, 'ok' | 'fail' | 'timeout'>()
  for (const domain of controlList) {
    if (cancelSignal.cancelled) break
    const { status } = await checkDomain(domain, 8000, cancelSignal)
    if (status !== 'pending') map.set(domain, status)
  }
  controlResults.value = map
}

export async function startRun(): Promise<void> {
  isRunning.value = true
  isCancelled.value = false
  cancelSignal.cancelled = false
  results.value = []
  progressDone.value = 0
  progressTotal.value = 0
  runStartTime.value = null

  try {
    const domains = await loadDomainList()
    if (domains.length === 0) {
      isRunning.value = false
      return
    }
    progressTotal.value = domains.length
    runStartTime.value = performance.now()
    const catMap = domainCategoryMap.value
    results.value = domains.map((d) => ({
      domain: d,
      category: catMap.get(d),
      status: 'pending' as const,
      probeUsed: null,
      latencyMs: null,
      checkedAt: '',
    }))

    await runControlChecks()

    const onResult = (r: DomainCheckResult) => {
      if (cancelSignal.cancelled) return
      const idx = results.value.findIndex((x) => x.domain === r.domain)
      if (idx >= 0) {
        const next = [...results.value]
        next[idx] = { ...r, category: next[idx].category ?? r.category }
        results.value = next
      }
    }
    const onProgress = (done: number, total: number) => {
      if (cancelSignal.cancelled) return
      progressDone.value = done
      progressTotal.value = total
    }

    await runChecks({
      domains,
      concurrency: concurrency.value,
      timeoutMs: timeoutMs.value,
      signal: cancelSignal,
      onResult,
      onProgress,
    })
  } finally {
    isRunning.value = false
    isCancelled.value = cancelSignal.cancelled
  }
}

export function stopRun(): void {
  cancelSignal.cancelled = true
}

export async function retryFailed(): Promise<void> {
  const failed = failedDomains.value.map((r) => r.domain)
  if (failed.length === 0) return
  isRunning.value = true
  isCancelled.value = false
  cancelSignal.cancelled = false
  progressDone.value = 0
  progressTotal.value = failed.length
  runStartTime.value = performance.now()

  const resultMap = new Map(results.value.map((r) => [r.domain, r]))
  const onResult = (r: DomainCheckResult) => {
    if (cancelSignal.cancelled) return
    resultMap.set(r.domain, r)
    results.value = Array.from(resultMap.values())
  }
  const onProgress = (done: number, total: number) => {
    progressDone.value = done
    progressTotal.value = total
  }

  try {
    await runChecks({
      domains: failed,
      concurrency: concurrency.value,
      timeoutMs: timeoutMs.value,
      signal: cancelSignal,
      onResult,
      onProgress,
    })
  } finally {
    isRunning.value = false
    isCancelled.value = cancelSignal.cancelled
  }
}

export function exportJson(): string {
  const stats = runStats.value
  const data = {
    exportedAt: new Date().toISOString(),
    stats: { ...stats },
    diagnostics: diagnostics.value,
    results: results.value,
    rknSnapshot: rknSnapshot.value ? { hasSnapshot: true, updatedAt: rknSnapshot.value.updatedAt } : { hasSnapshot: false },
  }
  return JSON.stringify(data, null, 2)
}

export async function loadRknSnapshot(): Promise<void> {
  try {
    const res = await fetch('/rkn_snapshot.json', { cache: 'no-store' })
    if (res.ok) {
      const data: RknSnapshot = await res.json()
      rknSnapshot.value = data
    } else {
      rknSnapshot.value = null
    }
  } catch {
    rknSnapshot.value = null
  }
}

export function getRknStatus(domain: string): 'yes' | 'no' | 'unknown' {
  const snap = rknSnapshot.value
  if (!snap?.domains || !Array.isArray(snap.domains) || snap.domains.length === 0) return 'unknown'
  const list = snap.domains as string[]
  const normalized = domain.toLowerCase().trim()
  if (list.some((d) => d.toLowerCase() === normalized || normalized.endsWith('.' + d.toLowerCase()))) return 'yes'
  return 'no'
}
