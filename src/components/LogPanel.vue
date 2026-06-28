<script setup>
  import { ref, watch, nextTick } from 'vue'

  /////////////////////////////////////////////
  // Define variables.
  const props = defineProps({
    entries: { type: Array, default: () => [] },
    autoScroll: { type: Boolean, default: true },
  })

  const listEnd = ref(null)

  // Watch the entries. We are doing this because if a new message comes in and it's past the full view of the log body.
  // (the log body now has a scroll bar.) We need to have the scroll be moved so we can see the entry.
  watch(
    () => props.entries.length,
    async () => {

      // In the settings you can change the autoscroll to be false, so don't autoscroll in this case.
      if (!props.autoScroll) 
        return

      // Wait for the entry to render before trying to scroll.
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
        v-for="(entry, i) in entries" :key="i" class="log-row" :class="`level-${entry.level?.toLowerCase() ?? 'info'}`">

        <span class="log-col-time">{{ entry.timestamp }}</span>
        <span class="log-col-msg">{{ entry.message }}</span>
      </div>
      <div ref="listEnd" />
    </div>
  </div>
</template>
