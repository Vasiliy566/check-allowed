import type { CheckStatus, ProbeUsed } from './types'

export type ProbeKind = 'favicon' | 'robots' | 'faviconPng' | 'head' | 'fetch'

export interface ProbeResult {
  status: CheckStatus
  latencyMs: number | null
  probe: ProbeKind
}

export interface DebugProbeStep {
  url: string
  probe: ProbeKind
  status: CheckStatus
  latencyMs: number | null
}

/** Query string to bypass browser/proxy cache (timestamp + random per request). */
function cacheBust(): string {
  return `_=${Date.now()}&r=${Math.random().toString(36).slice(2)}`
}

/**
 * Check is image-based only (favicon + apple-touch-icon). We do NOT use iframe:
 * iframe fires "load" even when the browser shows a block/error page, so blocked
 * sites would be reported as OK (false positive). Image only loads real image
 * responses, so blocked sites correctly get fail/timeout.
 * Sites without favicon may show FAIL even when reachable in browser.
 * We use cache-busting on every request so cached 404/fail from a previous load
 * doesn't make a reachable site appear failed.
 */
function probeFavicon(domain: string, timeoutMs: number, signal: { cancelled: boolean }): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    const url = `https://${domain}/favicon.ico?${cacheBust()}`
    const img = new Image()
    const done = (status: CheckStatus) => {
      if (signal.cancelled) return
      const latencyMs = status !== 'pending' ? Math.round(performance.now() - start) : null
      resolve({ status, latencyMs, probe: 'favicon' })
    }
    const t = setTimeout(() => done('timeout'), timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      done('ok')
    }
    img.onerror = () => {
      clearTimeout(t)
      done('fail')
    }
    img.src = url
  })
}

// Fallback: apple-touch-icon (image, CORS-free)
function probeRobots(domain: string, timeoutMs: number, signal: { cancelled: boolean }): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    const url = `https://${domain}/apple-touch-icon.png?${cacheBust()}`
    const img = new Image()
    const done = (status: CheckStatus) => {
      if (signal.cancelled) return
      const latencyMs = status !== 'pending' ? Math.round(performance.now() - start) : null
      resolve({ status, latencyMs, probe: 'robots' })
    }
    const t = setTimeout(() => done('timeout'), timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      done('ok')
    }
    img.onerror = () => {
      clearTimeout(t)
      done('fail')
    }
    img.src = url
  })
}

// Fallback 2: many sites use /favicon.png instead of .ico
function probeFaviconPng(domain: string, timeoutMs: number, signal: { cancelled: boolean }): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    const url = `https://${domain}/favicon.png?${cacheBust()}`
    const img = new Image()
    const done = (status: CheckStatus) => {
      if (signal.cancelled) return
      const latencyMs = status !== 'pending' ? Math.round(performance.now() - start) : null
      resolve({ status, latencyMs, probe: 'faviconPng' })
    }
    const t = setTimeout(() => done('timeout'), timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      done('ok')
    }
    img.onerror = () => {
      clearTimeout(t)
      done('fail')
    }
    img.src = url
  })
}

function fetchProbe(
  domain: string,
  timeoutMs: number,
  signal: { cancelled: boolean },
  method: 'HEAD' | 'GET',
  probeKind: 'head' | 'fetch'
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    const url = `https://${domain}/?${cacheBust()}`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    fetch(url, { method, mode: 'no-cors', cache: 'no-store', signal: controller.signal })
      .then(() => {
        if (signal.cancelled) return
        clearTimeout(t)
        resolve({
          status: 'ok',
          latencyMs: Math.round(performance.now() - start),
          probe: probeKind,
        })
      })
      .catch((err) => {
        if (signal.cancelled) return
        clearTimeout(t)
        const status: CheckStatus = err?.name === 'AbortError' ? 'timeout' : 'fail'
        resolve({
          status,
          latencyMs: Math.round(performance.now() - start),
          probe: probeKind,
        })
      })
  })
}

/** Fallback: HEAD request (lighter; some servers/CDNs respond where GET might be blocked). */
function probeHead(domain: string, timeoutMs: number, signal: { cancelled: boolean }): Promise<ProbeResult> {
  return fetchProbe(domain, timeoutMs, signal, 'HEAD', 'head')
}

/** Fallback: GET when no favicon; no-cors so we only see "request completed". */
function probeFetch(domain: string, timeoutMs: number, signal: { cancelled: boolean }): Promise<ProbeResult> {
  return fetchProbe(domain, timeoutMs, signal, 'GET', 'fetch')
}

export async function checkDomain(
  domain: string,
  timeoutMs: number,
  signal: { cancelled: boolean }
): Promise<{ status: CheckStatus; probeUsed: ProbeUsed; latencyMs: number | null; details: ProbeResult[] }> {
  const details: ProbeResult[] = []
  const favicon = await probeFavicon(domain, timeoutMs, signal)
  details.push(favicon)
  if (signal.cancelled) {
    return { status: 'pending', probeUsed: null, latencyMs: null, details }
  }
  if (favicon.status === 'ok') {
    return {
      status: 'ok',
      probeUsed: 'favicon',
      latencyMs: favicon.latencyMs,
      details,
    }
  }
  const robots = await probeRobots(domain, timeoutMs, signal)
  details.push(robots)
  if (signal.cancelled) {
    return { status: 'pending', probeUsed: null, latencyMs: null, details }
  }
  if (robots.status === 'ok') {
    return {
      status: 'ok',
      probeUsed: 'robots',
      latencyMs: robots.latencyMs,
      details,
    }
  }
  const faviconPng = await probeFaviconPng(domain, timeoutMs, signal)
  details.push(faviconPng)
  if (signal.cancelled) {
    return { status: 'pending', probeUsed: null, latencyMs: null, details }
  }
  if (faviconPng.status === 'ok') {
    return {
      status: 'ok',
      probeUsed: 'faviconPng',
      latencyMs: faviconPng.latencyMs,
      details,
    }
  }
  // Fallback 1: HEAD (lighter; helps e.g. emex.ru, stackoverflow.com behind Cloudflare).
  const headResult = await probeHead(domain, timeoutMs, signal)
  details.push(headResult)
  if (signal.cancelled) {
    return { status: 'pending', probeUsed: null, latencyMs: null, details }
  }
  if (headResult.status === 'ok') {
    return {
      status: 'ok',
      probeUsed: 'head',
      latencyMs: headResult.latencyMs,
      details,
    }
  }
  // Fallback 2: GET no-cors (e.g. 24.kg).
  const fetchResult = await probeFetch(domain, timeoutMs, signal)
  details.push(fetchResult)
  if (signal.cancelled) {
    return { status: 'pending', probeUsed: null, latencyMs: null, details }
  }
  if (fetchResult.status === 'ok') {
    return {
      status: 'ok',
      probeUsed: 'fetch',
      latencyMs: fetchResult.latencyMs,
      details,
    }
  }
  const allTimeout = [favicon, robots, faviconPng, headResult, fetchResult].every((p) => p.status === 'timeout')
  const status: CheckStatus = allTimeout ? 'timeout' : 'fail'
  const latencyMs = favicon.latencyMs ?? robots.latencyMs ?? faviconPng.latencyMs ?? headResult.latencyMs ?? fetchResult.latencyMs
  return {
    status,
    probeUsed: 'fetch',
    latencyMs,
    details,
  }
}

/** Build URLs we use for probing (for debug display). */
export function getProbeUrls(domain: string): { url: string; probe: ProbeKind }[] {
  const t = `_=${Date.now()}&r=debug`
  return [
    { url: `https://${domain}/favicon.ico?${t}`, probe: 'favicon' },
    { url: `https://${domain}/apple-touch-icon.png?${t}`, probe: 'robots' },
    { url: `https://${domain}/favicon.png?${t}`, probe: 'faviconPng' },
  ]
}

/** Run all probes and return detailed steps for debugging. */
export async function debugCheckDomain(
  domain: string,
  timeoutMs: number = 8000
): Promise<DebugProbeStep[]> {
  const signal = { cancelled: false }
  const steps: DebugProbeStep[] = []
  const favicon = await probeFavicon(domain, timeoutMs, signal)
  steps.push({
    url: `https://${domain}/favicon.ico`,
    probe: 'favicon',
    status: favicon.status,
    latencyMs: favicon.latencyMs,
  })
  if (favicon.status === 'ok') return steps
  const robots = await probeRobots(domain, timeoutMs, signal)
  steps.push({
    url: `https://${domain}/apple-touch-icon.png`,
    probe: 'robots',
    status: robots.status,
    latencyMs: robots.latencyMs,
  })
  if (robots.status === 'ok') return steps
  const faviconPng = await probeFaviconPng(domain, timeoutMs, signal)
  steps.push({
    url: `https://${domain}/favicon.png`,
    probe: 'faviconPng',
    status: faviconPng.status,
    latencyMs: faviconPng.latencyMs,
  })
  if (faviconPng.status === 'ok') return steps
  const headResult = await probeHead(domain, timeoutMs, signal)
  steps.push({
    url: `https://${domain}/ (HEAD)`,
    probe: 'head',
    status: headResult.status,
    latencyMs: headResult.latencyMs,
  })
  if (headResult.status === 'ok') return steps
  const fetchResult = await probeFetch(domain, timeoutMs, signal)
  steps.push({
    url: `https://${domain}/ (GET)`,
    probe: 'fetch',
    status: fetchResult.status,
    latencyMs: fetchResult.latencyMs,
  })
  return steps
}
