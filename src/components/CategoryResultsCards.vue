<script setup lang="ts">
import { resultsByCategory } from '../store'

function categorySummary(stats: { ok: number; fail: number; timeout: number; total: number }) {
  const { ok, fail, timeout, total } = stats
  const bad = fail + timeout
  if (total === 0) return { text: 'не проверялось', icon: '—', class: 'text-zinc-500' }
  if (bad === 0) return { text: `${ok} доступны`, icon: '✅', class: 'text-emerald-400' }
  if (ok === 0) return { text: `${bad} недоступны`, icon: '❌', class: 'text-red-400' }
  return { text: `${ok} OK, ${bad} недоступны`, icon: '⚠️', class: 'text-amber-400' }
}
</script>

<template>
  <section class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div
        v-for="stats in resultsByCategory"
        :key="stats.category"
        class="rounded-lg border border-zinc-700 bg-zinc-800/80 p-3"
      >
        <p class="text-xs text-zinc-500 mb-1">{{ stats.shortLabel }}</p>
        <p class="text-sm font-medium" :class="categorySummary(stats).class">
          {{ categorySummary(stats).icon }} {{ categorySummary(stats).text }}
        </p>
        <p v-if="stats.total > 0" class="text-xs text-zinc-500 mt-0.5">
          {{ stats.ok }} OK / {{ stats.fail + stats.timeout }} fail
        </p>
      </div>
    </div>
  </section>
</template>
