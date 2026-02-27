<script setup lang="ts">
import {
  selectedCategories,
  DOMAIN_CATEGORIES,
  DOMAIN_CATEGORY_SOURCES,
} from '../store'
import type { DomainCategory } from '../types'

function shortLabel(cat: DomainCategory): string {
  return DOMAIN_CATEGORY_SOURCES[cat].shortLabel
}

function toggleCategory(cat: DomainCategory) {
  const current = selectedCategories.value
  if (current.includes(cat)) {
    if (current.length <= 1) return
    selectedCategories.value = current.filter((c) => c !== cat)
  } else {
    const order = DOMAIN_CATEGORIES
    selectedCategories.value = [...current, cat].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }
}
</script>

<template>
  <section class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
    <p class="text-xs text-zinc-500 mb-2">Списки для проверки:</p>
    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <label
        v-for="cat in DOMAIN_CATEGORIES"
        :key="cat"
        class="flex items-center gap-2 cursor-pointer text-sm text-zinc-400"
        :title="DOMAIN_CATEGORY_SOURCES[cat].label"
      >
        <input
          type="checkbox"
          :checked="selectedCategories.includes(cat)"
          @change="toggleCategory(cat)"
          class="rounded"
        />
        {{ shortLabel(cat) }}
      </label>
    </div>
    <p class="text-xs text-zinc-500 mt-2 space-y-0.5">
      <span class="block">Заблокировано компанией — сервисы, ограниченные по санкциям или решению компании.</span>
      <span class="block">Заблокировано в РФ — заблокировано РКН и т.п. на территории России.</span>
      <span class="block">Только РФ — домены, доступные только из России (госкуслуги и т.п.).</span>
    </p>
  </section>
</template>
