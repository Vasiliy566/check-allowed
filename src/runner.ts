import type { DomainCheckResult } from './types'
import { checkDomain } from './probes'

export interface RunnerOptions {
  domains: string[]
  concurrency: number
  timeoutMs: number
  signal: { cancelled: boolean }
  onResult: (result: DomainCheckResult) => void
  onProgress: (done: number, total: number) => void
}

export async function runChecks(options: RunnerOptions): Promise<void> {
  const { domains, concurrency, timeoutMs, signal, onResult, onProgress } = options
  let done = 0
  const total = domains.length
  const queue = [...domains]
  const runOne = async (): Promise<void> => {
    while (!signal.cancelled && queue.length > 0) {
      const domain = queue.shift()!
      const { status, probeUsed, latencyMs, details } = await checkDomain(domain, timeoutMs, signal)
      if (signal.cancelled) return
      const fav = details.find((d) => d.probe === 'favicon')
      const rob = details.find((d) => d.probe === 'robots')
      const favPng = details.find((d) => d.probe === 'faviconPng')
      const head = details.find((d) => d.probe === 'head')
      const fet = details.find((d) => d.probe === 'fetch')
      const result: DomainCheckResult = {
        domain,
        status,
        probeUsed,
        latencyMs,
        checkedAt: new Date().toISOString(),
        details:
          fav || rob || favPng || head || fet
            ? {
                favicon: fav ? { status: fav.status, latencyMs: fav.latencyMs } : undefined,
                robots: rob ? { status: rob.status, latencyMs: rob.latencyMs } : undefined,
                faviconPng: favPng ? { status: favPng.status, latencyMs: favPng.latencyMs } : undefined,
                head: head ? { status: head.status, latencyMs: head.latencyMs } : undefined,
                fetch: fet ? { status: fet.status, latencyMs: fet.latencyMs } : undefined,
              }
            : undefined,
      }
      onResult(result)
      done++
      onProgress(done, total)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runOne())
  await Promise.all(workers)
}
