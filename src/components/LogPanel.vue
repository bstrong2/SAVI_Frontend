<script setup>
  import { ref, watch, nextTick } from 'vue'

  
  /////////////////////////////////////////////
  // Define variables.
  const props = defineProps({
    entries: { type: Array, default: () => [] },
    autoScroll: { type: Boolean, default: true },
  })

  const listEnd = ref(null)


  /////////////////////////////////////////////
  // Watch for changes.

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

<style scoped>
/*
 * ==========================================
 * Log view
 * ==========================================
 */

/* Full-height flex column that holds the log header and scrollable log body. */
.log-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Sticky column header row above the log entries. */
.log-header {
  display: flex;
  background: var(--bg-table-header);
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 12px;
  padding: 3px 8px;
  flex-shrink: 0;
}

/* Scrollable container for all log entry rows. */
.log-body {
  flex: 1;
  overflow-y: auto;
}

/* One log entry row — timestamp column + message column. */
.log-row {
  display: flex;
  padding: 2px 8px;
  font-size: 12px;
  border-bottom: 1px solid transparent;
}
.log-row:hover { background: var(--bg-table-hover); }

/* Fixed-width timestamp column. */
.log-col-time {
  width: 90px;
  flex-shrink: 0;
  color: var(--text-secondary);
}
/* Message column fills all remaining space. */
.log-col-msg { flex: 1; }

/* Text color per log severity level. */
.log-row.level-info    { color: var(--text-primary); }
.log-row.level-warning { color: var(--color-goldenrod); }
.log-row.level-error   { color: var(--color-red); }
/* Critical entries get a red background to stand out immediately. */
.log-row.level-critical {
  color: var(--color-white);
  background: var(--color-crimson);
  font-weight: 600;
}
</style>
