<script setup lang="ts">
import { ref, computed } from 'vue'
import { results, getRknStatus, rknSnapshot } from '../store'
import type { DomainCheckResult, CheckStatus, DomainCategory } from '../types'

type FilterStatus = 'all' | 'ok' | 'fail' | 'timeout'
type FilterCategory = 'all' | DomainCategory
type SortKey = 'domain' | 'status' | 'category' | 'latencyMs' | 'checkedAt'
type SortDir = 'asc' | 'desc'

const filterStatus = ref<FilterStatus>('all')
const filterCategory = ref<FilterCategory>('all')
const searchQuery = ref('')
const sortKey = ref<SortKey>('domain')
const sortDir = ref<SortDir>('asc')
const selectedRow = ref<DomainCheckResult | null>(null)

function categoryLabel(cat: DomainCategory | undefined): string {
  if (!cat) return '—'
  const labels: Record<DomainCategory, string> = {
    company_blocked: 'Company',
    blocked_by_russia: 'RKN',
    russian_specific: 'RU only',
    allowed: 'Allowed',
  }
  return labels[cat]
}

const filtered = computed(() => {
  let list = results.value
  if (filterStatus.value !== 'all') {
    list = list.filter((r) => r.status === filterStatus.value)
  }
  if (filterCategory.value !== 'all') {
    list = list.filter((r) => r.category === filterCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((r) => r.domain.toLowerCase().includes(q))
  }
  return [...list].sort((a, b) => {
    let cmp = 0
    switch (sortKey.value) {
      case 'domain':
        cmp = a.domain.localeCompare(b.domain)
        break
      case 'status':
        cmp = (a.status === 'ok' ? 3 : a.status === 'timeout' ? 2 : a.status === 'fail' ? 1 : 0) -
          (b.status === 'ok' ? 3 : b.status === 'timeout' ? 2 : b.status === 'fail' ? 1 : 0)
        break
      case 'category':
        cmp = (a.category || '').localeCompare(b.category || '')
        break
      case 'latencyMs':
        cmp = (a.latencyMs ?? 0) - (b.latencyMs ?? 0)
        break
      case 'checkedAt':
        cmp = (a.checkedAt || '').localeCompare(b.checkedAt || '')
        break
      default:
        break
    }
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}

function statusLabel(s: CheckStatus): string {
  switch (s) {
    case 'ok': return 'OK'
    case 'fail': return 'FAIL'
    case 'timeout': return 'TIMEOUT'
    default: return '—'
  }
}

function probeLabel(p: DomainCheckResult['probeUsed']): string {
  if (p === 'favicon') return 'favicon'
  if (p === 'robots') return 'apple-touch'
  if (p === 'faviconPng') return 'favicon.png'
  if (p === 'head') return 'HEAD'
  if (p === 'fetch') return 'GET'
  return '—'
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

const hasRkn = computed(() => {
  const d = rknSnapshot.value?.domains
  return Array.isArray(d) && d.length > 0
})
</script>

<template>
  <section class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <h2 class="text-sm font-semibold text-zinc-300">Таблица</h2>
      <select
        v-model="filterStatus"
        class="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200"
      >
        <option value="all">All</option>
        <option value="ok">OK</option>
        <option value="fail">FAIL</option>
        <option value="timeout">TIMEOUT</option>
      </select>
      <select
        v-model="filterCategory"
        class="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200"
      >
        <option value="all">All types</option>
        <option value="company_blocked">Company blocked</option>
        <option value="blocked_by_russia">Blocked by Russia</option>
        <option value="russian_specific">Russian only</option>
        <option value="allowed">Allowed</option>
      </select>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Поиск по домену..."
        class="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-200 placeholder-zinc-500 w-48"
      />
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-zinc-700 text-left text-zinc-500">
            <th
              class="cursor-pointer py-2 pr-2 hover:text-zinc-300"
              @click="toggleSort('domain')"
            >
              domain {{ sortKey === 'domain' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th
              class="cursor-pointer py-2 pr-2 hover:text-zinc-300"
              @click="toggleSort('status')"
            >
              status {{ sortKey === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th
              class="cursor-pointer py-2 pr-2 hover:text-zinc-300"
              @click="toggleSort('category')"
            >
              type {{ sortKey === 'category' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th class="py-2 pr-2">probe</th>
            <th
              class="cursor-pointer py-2 pr-2 hover:text-zinc-300"
              @click="toggleSort('latencyMs')"
            >
              latencyMs {{ sortKey === 'latencyMs' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th
              class="cursor-pointer py-2 pr-2 hover:text-zinc-300"
              @click="toggleSort('checkedAt')"
            >
              checkedAt {{ sortKey === 'checkedAt' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}
            </th>
            <th v-if="hasRkn" class="py-2 pr-2">RKN</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filtered"
            :key="r.domain"
            class="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
            @click="selectedRow = r"
          >
            <td class="py-2 pr-2 font-mono">
              <a
                :href="`https://${r.domain}`"
                target="_blank"
                rel="noopener noreferrer"
                class="text-zinc-300 hover:text-emerald-400 underline"
                @click.stop
              >{{ r.domain }}</a>
            </td>
            <td class="py-2 pr-2">
              <span
                :class="{
                  'text-emerald-400': r.status === 'ok',
                  'text-red-400': r.status === 'fail',
                  'text-amber-400': r.status === 'timeout',
                  'text-zinc-500': r.status === 'pending',
                }"
              >
                {{ statusLabel(r.status) }}
              </span>
            </td>
            <td class="py-2 pr-2 text-zinc-400">{{ categoryLabel(r.category) }}</td>
            <td class="py-2 pr-2 text-zinc-400">{{ probeLabel(r.probeUsed) }}</td>
            <td class="py-2 pr-2 text-zinc-400">{{ r.latencyMs != null ? r.latencyMs : '—' }}</td>
            <td class="py-2 pr-2 text-zinc-500">{{ formatTime(r.checkedAt) }}</td>
            <td v-if="hasRkn" class="py-2 pr-2 text-zinc-500">
              {{ getRknStatus(r.domain) === 'yes' ? 'yes' : getRknStatus(r.domain) === 'no' ? 'no' : 'unknown' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="results.length === 0" class="py-4 text-center text-zinc-500 text-sm">
      Запустите проверку
    </p>
    <p v-else-if="filtered.length === 0" class="py-4 text-center text-zinc-500 text-sm">
      Нет записей по фильтру
    </p>

    <!-- RKN hint -->
    <p v-if="!hasRkn && results.length > 0" class="mt-3 text-xs text-zinc-500">
      RKN: unknown — положите <code class="bg-zinc-800 px-1 rounded">rkn_snapshot.json</code> в <code class="bg-zinc-800 px-1 rounded">public/</code> для отображения колонки.
    </p>

    <!-- Row details modal -->
    <Teleport to="body">
      <div
        v-if="selectedRow"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        @click.self="selectedRow = null"
      >
        <div class="rounded-xl border border-zinc-700 bg-zinc-900 p-4 max-w-md w-full shadow-xl">
          <h3 class="font-mono text-zinc-200 font-medium mb-2">
            <a
              :href="`https://${selectedRow.domain}`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-zinc-200 hover:text-emerald-400 underline"
            >{{ selectedRow.domain }}</a>
          </h3>
          <p class="text-sm text-zinc-400 mb-2">
            Status: {{ statusLabel(selectedRow.status) }}, probe: {{ probeLabel(selectedRow.probeUsed) }},
            latency: {{ selectedRow.latencyMs ?? '—' }} ms
          </p>
          <div v-if="selectedRow.details" class="text-xs text-zinc-500 space-y-1">
            <p v-if="selectedRow.details.favicon">
              favicon: {{ selectedRow.details.favicon.status }} ({{ selectedRow.details.favicon.latencyMs ?? '—' }} ms)
            </p>
            <p v-if="selectedRow.details.robots">
              apple-touch: {{ selectedRow.details.robots.status }} ({{ selectedRow.details.robots.latencyMs ?? '—' }} ms)
            </p>
            <p v-if="selectedRow.details.faviconPng">
              favicon.png: {{ selectedRow.details.faviconPng.status }} ({{ selectedRow.details.faviconPng.latencyMs ?? '—' }} ms)
            </p>
            <p v-if="selectedRow.details.head">
              HEAD: {{ selectedRow.details.head.status }} ({{ selectedRow.details.head.latencyMs ?? '—' }} ms)
            </p>
            <p v-if="selectedRow.details.fetch">
              GET: {{ selectedRow.details.fetch.status }} ({{ selectedRow.details.fetch.latencyMs ?? '—' }} ms)
            </p>
          </div>
          <p class="text-xs text-zinc-500 mt-2">checkedAt: {{ selectedRow.checkedAt }}</p>
          <button
            class="mt-3 rounded bg-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-600"
            @click="selectedRow = null"
          >
            Закрыть
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>
