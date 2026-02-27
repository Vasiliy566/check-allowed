<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dashboard from './components/Dashboard.vue'
import Settings from './components/Settings.vue'
import CategoryResultsCards from './components/CategoryResultsCards.vue'
import ResultsTable from './components/ResultsTable.vue'
import { loadRknSnapshot } from './store'

const showDetails = ref(false)

onMounted(() => {
  loadRknSnapshot()
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-zinc-800 px-4 py-3">
      <h1 class="text-lg font-semibold text-zinc-100">
        Диагностика доступности сайтов
      </h1>
      <p class="text-sm text-zinc-500 mt-0.5">
        Проверка с текущего устройства
      </p>
    </header>

    <main class="flex-1 p-4 space-y-6 max-w-6xl w-full mx-auto">
      <Dashboard />
      <Settings />
      <CategoryResultsCards />
      <button
        type="button"
        class="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? 'Скрыть детали' : 'Детали' }}
      </button>
      <ResultsTable v-show="showDetails" />
    </main>

    <footer class="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500 space-y-1">
      <p>Источники доменов: itdoginfo/allow-domains. Приложение только для диагностики, не для обхода блокировок.</p>
      <p>Проверка: favicon → apple-touch → favicon.png → HEAD → GET. Сайты за Cloudflare или с антиботом могут давать fail при доступности. Отдельные домены (например academy.creatio.com, 4pda.ws) могут не отвечать на автоматические запросы и искажать общую статистику.</p>
    </footer>
  </div>
</template>
