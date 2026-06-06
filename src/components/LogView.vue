<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  entries: { type: Array, default: () => [] },
})

const listEnd = ref(null)

watch(
  () => props.entries.length,
  async () => {
    await nextTick()
    listEnd.value?.scrollIntoView({ behavior: 'smooth' })
  }
)
</script>

<template>
  <div class="log-view">
    <div class="log-header">
      <span class="log-col-time">Time</span>
      <span class="log-col-msg">Message</span>
    </div>
    <div class="log-body">
      <div
        v-for="(entry, i) in entries"
        :key="i"
        class="log-row"
        :class="`level-${entry.level?.toLowerCase() ?? 'info'}`"
      >
        <span class="log-col-time">{{ entry.timestamp }}</span>
        <span class="log-col-msg">{{ entry.message }}</span>
      </div>
      <div ref="listEnd" />
    </div>
  </div>
</template>
