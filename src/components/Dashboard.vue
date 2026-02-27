<script setup lang="ts">
import {
  diagnostics,
  runStats,
  isRunning,
  startRun,
  stopRun,
  retryFailed,
  exportJson,
  failedDomains,
  resultsByCategory,
} from '../store'

function doExport() {
  const json = exportJson()
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `check-sites-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <section class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <p class="text-sm text-zinc-400 mb-3">
      {{ diagnostics.healthMessage }}
    </p>

    <!-- Progress by category -->
    <div class="space-y-2 mb-4">
      <div
        v-for="cat in resultsByCategory"
        :key="cat.category"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="text-xs text-zinc-500 w-20 shrink-0">{{ cat.shortLabel }}</span>
        <div class="flex-1 min-w-0 h-1.5 rounded-full bg-zinc-800 overflow-hidden max-w-xs">
          <div
            class="h-full bg-zinc-600 transition-all duration-200"
            :style="{ width: cat.total ? `${(cat.done / cat.total) * 100}%` : '0%' }"
          />
        </div>
        <span class="text-xs text-zinc-400 shrink-0">
          {{ cat.done }}/{{ cat.total }}
          <span v-if="cat.done > 0" class="ml-1">
            <span class="text-emerald-500">OK {{ cat.ok }}</span>
            <span v-if="cat.fail + cat.timeout > 0" class="text-red-400 ml-0.5">Fail {{ cat.fail + cat.timeout }}</span>
          </span>
        </span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
      <span v-if="runStats.durationMs != null">
        Время: {{ (runStats.durationMs / 1000).toFixed(1) }} с
      </span>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        v-if="!isRunning"
        @click="startRun"
        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Start
      </button>
      <button
        v-if="isRunning"
        @click="stopRun"
        class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
      >
        Stop
      </button>
      <button
        v-if="!isRunning && failedDomains.length > 0"
        @click="retryFailed"
        class="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
      >
        Retry failed ({{ failedDomains.length }})
      </button>
      <button
        v-if="runStats.total > 0"
        @click="doExport"
        class="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
      >
        Export JSON
      </button>
    </div>
  </section>
</template>
