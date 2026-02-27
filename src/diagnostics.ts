import type { CheckStatus, DomainCheckResult, DiagnosticsState, HealthStatus } from './types'

/** Control domains: primary has favicon (wikipedia.org), rawGithub for list loading. No example.com — it has no favicon. */
export const CONTROL_DOMAINS = {
  primary: 'wikipedia.org', // has favicon, widely reachable
  rawGithub: 'raw.githubusercontent.com',
} as const

export function computeDiagnostics(
  controlResults: Map<string, CheckStatus>,
  listLoaded: boolean,
  usedFallback: boolean,
  runResults: DomainCheckResult[],
  okThresholdRatio: number = 0.85
): DiagnosticsState {
  const primary = controlResults.get(CONTROL_DOMAINS.primary)
  const rawGithub = controlResults.get(CONTROL_DOMAINS.rawGithub)

  const checked = runResults.filter((r) => r.status !== 'pending')
  const total = checked.length
  const okCount = checked.filter((r) => r.status === 'ok').length
  const okRatio = total > 0 ? okCount / total : 0

  let healthStatus: HealthStatus = 'ok'
  let healthMessage = ''

  const primaryFailed = primary === 'fail' || primary === 'timeout'
  const hasOtherConnectivity = total > 0 && okRatio >= 0.15

  if (primaryFailed && !hasOtherConnectivity) {
    healthStatus = 'no-internet'
    healthMessage = 'Нет интернета или сломан DNS (контрольный домен и остальные недоступны)'
  } else if (primaryFailed && hasOtherConnectivity) {
    healthStatus = okRatio > okThresholdRatio ? 'ok' : 'partial'
    healthMessage = okRatio > okThresholdRatio
      ? `Доступ есть. Контрольный домен не ответил, но ${okCount}/${total} доменов доступны`
      : `Частичная доступность: ${okCount}/${total}`
  } else if (primary === 'ok' && (rawGithub === 'fail' || rawGithub === 'timeout') && usedFallback) {
    healthStatus = 'lists-unavailable'
    healthMessage = 'Списки с GitHub загрузить не удалось, используется локальный список'
  } else if (primary === 'ok' && total > 0) {
    if (okRatio > okThresholdRatio) {
      healthStatus = 'ok'
      healthMessage = 'Доступ в норме, большинство доменов открываются'
    } else if (okRatio >= 0.5) {
      healthStatus = 'partial'
      healthMessage = `Частичная недоступность: ${okCount}/${total} доменов доступны`
    } else {
      healthStatus = 'partial'
      healthMessage = `Много доменов недоступны: ${okCount}/${total}`
    }
  } else if (!listLoaded && usedFallback) {
    healthStatus = 'lists-unavailable'
    healthMessage = 'Используется резервный список (GitHub недоступен)'
  } else {
    healthMessage = 'Запустите проверку'
  }

  return {
    controlExampleCom: primary ?? null,
    controlWikipedia: primary ?? null,
    controlRawGithub: rawGithub ?? null,
    listsLoaded: listLoaded,
    usedFallbackList: usedFallback,
    healthStatus,
    healthMessage,
    okRatio,
  }
}
