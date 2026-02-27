import type { DomainSourcePreset, DomainCategory } from './types'

const BASE = 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main'

/** Exclude rare/niche domains; keep most popular. Applied to all loaded lists. */
const EXCLUDED_DOMAINS = new Set<string>([
  '1337x.to',
  '4pda.ws',
  'cms1.dzvr.ru',
  'rutor.info',
  'nnmclub.to',
  'kinogo.biz',
  'anidub.com',
  'lostfilm.tv',
  'baibako.tv',
  'toloka.to',
  'academy.creatio.com',
  'ads-twitter.com',
  'ua',
  'www.alza.hu',
  'alza.hu',
  '1018213540.rsc.cdn77.org',
].map((d) => d.toLowerCase()))

function filterExcluded(domains: string[]): string[] {
  return domains.filter((d) => {
    const lower = d.toLowerCase()
    if (EXCLUDED_DOMAINS.has(lower)) return false
    if (lower.endsWith('.ua')) return false
    return true
  })
}

/** 4 types of domains: default sources for "check all types" */
export const DOMAIN_CATEGORY_SOURCES: Record<DomainCategory, { label: string; shortLabel: string; url: string }> = {
  company_blocked: {
    label: 'Сервисы, заблокированные компанией (санкции, ограничения доступа из РФ)',
    shortLabel: 'Заблокировано компанией',
    url: `${BASE}/Services/google_ai.lst`,
  },
  blocked_by_russia: {
    label: 'Заблокировано на территории РФ (РКН и т.п.)',
    shortLabel: 'Заблокировано в РФ',
    url: `${BASE}/Russia/inside-raw.lst`,
  },
  russian_specific: {
    label: 'Домены, доступные только из России (госкуслуги и т.п.)',
    shortLabel: 'Только РФ',
    url: `${BASE}/Russia/outside-raw.lst`,
  },
  allowed: {
    label: 'Обычно доступные',
    shortLabel: 'Доступные',
    url: '', // uses static list
  },
}

export const DOMAIN_SOURCE_PRESETS: DomainSourcePreset[] = [
  { id: 'russia-inside', label: 'Russia inside RAW', url: `${BASE}/Russia/inside-raw.lst`, category: 'blocked_by_russia' },
  { id: 'russia-outside', label: 'Russia outside RAW', url: `${BASE}/Russia/outside-raw.lst`, category: 'russian_specific' },
  { id: 'google-ai', label: 'Services: Google AI (company-blocked)', url: `${BASE}/Services/google_ai.lst`, category: 'company_blocked' },
  { id: 'youtube', label: 'Services: YouTube', url: `${BASE}/Services/youtube.lst` },
  { id: 'discord', label: 'Services: Discord', url: `${BASE}/Services/discord.lst` },
  { id: 'meta', label: 'Services: Meta', url: `${BASE}/Services/meta.lst` },
  { id: 'telegram', label: 'Services: Telegram', url: `${BASE}/Services/telegram.lst` },
  { id: 'tiktok', label: 'Services: Tik-Tok', url: `${BASE}/Services/tiktok.lst` },
  { id: 'twitter', label: 'Services: Twitter', url: `${BASE}/Services/twitter.lst` },
  { id: 'hdrezka', label: 'Services: HDRezka', url: `${BASE}/Services/hdrezka.lst` },
]

function normalizeLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) return null
  return trimmed
}

function extractDomain(raw: string): string {
  let s = raw.toLowerCase().trim()
  // strip protocol
  s = s.replace(/^https?:\/\//i, '')
  // strip path and query
  const pathStart = s.indexOf('/')
  if (pathStart >= 0) s = s.slice(0, pathStart)
  const queryStart = s.indexOf('?')
  if (queryStart >= 0) s = s.slice(0, queryStart)
  // strip port
  const portStart = s.indexOf(':')
  if (portStart >= 0) s = s.slice(0, portStart)
  // leading dot
  s = s.replace(/^\.+/, '')
  if (!s) return ''
  return s
}

export function parseDomainList(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of lines) {
    const normalized = normalizeLine(line)
    if (!normalized) continue
    const domain = extractDomain(normalized)
    if (!domain || domain.length < 2) continue
    if (seen.has(domain)) continue
    seen.add(domain)
    result.push(domain)
  }
  return result
}

export async function fetchDomainList(url: string): Promise<string[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const text = await res.text()
  return filterExcluded(parseDomainList(text))
}

export interface DomainWithCategory {
  domain: string
  category: DomainCategory
}

/** Load domains from selected categories (for "check all types"). Limit per category = totalLimit / 4. */
export async function loadDomainsForCategories(
  selectedCategories: DomainCategory[],
  totalLimit: number
): Promise<{ list: DomainWithCategory[]; usedFallback: boolean }> {
  const perCategory = Math.max(1, Math.floor(totalLimit / selectedCategories.length))
  const seen = new Set<string>()
  const list: DomainWithCategory[] = []
  let usedFallback = false

  for (const cat of selectedCategories) {
    if (list.length >= totalLimit) break
    const take = Math.min(perCategory, totalLimit - list.length)
    let domains: string[]
    if (cat === 'allowed') {
      domains = await getAllowedDomains()
      if (domains.length === 0) {
        domains = getHardcodedAllowedDomains()
        usedFallback = true
      }
    } else {
      const url = DOMAIN_CATEGORY_SOURCES[cat].url
      try {
        domains = await fetchDomainList(url)
      } catch {
        domains = filterExcluded(await loadFallbackDomains()).slice(0, take)
        usedFallback = true
      }
    }
    if (cat === 'allowed') domains = filterExcluded(domains)
    let added = 0
    for (const d of domains) {
      if (added >= take || list.length >= totalLimit) break
      if (seen.has(d)) continue
      seen.add(d)
      list.push({ domain: d, category: cat })
      added++
    }
  }
  return { list: list.slice(0, totalLimit), usedFallback }
}

let allowedCache: string[] | null = null

async function getAllowedDomains(): Promise<string[]> {
  if (allowedCache) return allowedCache
  try {
    const res = await fetch('/allowed_domains.txt', { cache: 'no-store' })
    if (res.ok) {
      const text = await res.text()
      allowedCache = parseDomainList(text)
      if (allowedCache.length > 0) return allowedCache
    }
  } catch {
    // ignore
  }
  allowedCache = getHardcodedAllowedDomains()
  return allowedCache
}

function getHardcodedAllowedDomains(): string[] {
  return [
    'wikipedia.org',
    'google.com',
    'github.com',
    'cloudflare.com',
    'microsoft.com',
    'apple.com',
    'amazon.com',
    'stackoverflow.com',
    'reddit.com',
    'medium.com',
    'bbc.com',
    'reuters.com',
    'wikipedia.org',
  ]
}

export async function loadDomainsFromPresetOrUrl(
  presetUrl: string | null,
  customUrl: string | null
): Promise<{ domains: string[]; usedFallback: boolean }> {
  const url = customUrl?.trim() || presetUrl
  if (url) {
    try {
      const domains = await fetchDomainList(url)
      if (domains.length > 0) return { domains, usedFallback: false }
    } catch {
      // fall through to fallback
    }
  }
  const fallback = await loadFallbackDomains()
  return { domains: filterExcluded(fallback), usedFallback: true }
}

let fallbackCache: string[] | null = null

export async function loadFallbackDomains(): Promise<string[]> {
  if (fallbackCache) return fallbackCache
  try {
    const res = await fetch('/default_domains.txt', { cache: 'no-store' })
    if (res.ok) {
      const text = await res.text()
      fallbackCache = parseDomainList(text)
      if (fallbackCache.length > 0) return fallbackCache
    }
  } catch {
    // ignore
  }
  fallbackCache = getHardcodedFallbackDomains()
  return fallbackCache
}

function getHardcodedFallbackDomains(): string[] {
  return [
    'wikipedia.org',
    'google.com',
    'youtube.com',
    'github.com',
    'raw.githubusercontent.com',
    'cloudflare.com',
    'discord.com',
    'telegram.org',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'vk.com',
    'ya.ru',
    'yandex.ru',
    'mail.ru',
    'ok.ru',
    'tiktok.com',
    'twitch.tv',
    'reddit.com',
    'amazon.com',
    'microsoft.com',
    'apple.com',
    'netflix.com',
    'spotify.com',
    'zoom.us',
    'slack.com',
    'medium.com',
    'stackoverflow.com',
    'wikipedia.org',
  ]
}
