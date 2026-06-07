<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['close'])

const runs = ref([
  { id: 1, name: 'Run 001', comments: 'Initial baseline test run.', startTime: '2026-06-01 08:00:00', endTime: '2026-06-01 09:45:00', startedBy: 'admin' },
  { id: 2, name: 'Run 002', comments: 'Pressure validation — increased flow rate by 10%.', startTime: '2026-06-02 13:30:00', endTime: '2026-06-02 15:10:00', startedBy: 'operator1' },
  { id: 3, name: 'Run 003', comments: '', startTime: '2026-06-04 09:00:00', endTime: '2026-06-04 10:22:00', startedBy: 'admin' },
])

const selectedRun = ref(null)

function generateReport() {
  if (!selectedRun.value) return
  const r = selectedRun.value
  const lines = [
    'SAVI Run Report',
    '===============',
    `Run:        ${r.name}`,
    `Started By: ${r.startedBy}`,
    `Start Time: ${r.startTime}`,
    `End Time:   ${r.endTime}`,
    `Comments:   ${r.comments || '(none)'}`,
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${r.name.replace(/\s+/g, '_')}_report.txt`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="report-dialog">

      <div class="report-body">
        <!-- Left: Available Runs -->
        <div class="report-group">
          <div class="report-group-header">Available Runs</div>
          <div class="run-list">
            <div
              v-for="run in runs"
              :key="run.id"
              class="run-list-item"
              :class="{ selected: selectedRun?.id === run.id }"
              @click="selectedRun = run"
            >
              {{ run.name }}
            </div>
            <div v-if="runs.length === 0" class="run-list-empty">No runs available</div>
          </div>
        </div>

        <!-- Right: Run Details -->
        <div class="report-group">
          <div class="report-group-header">Run Details</div>
          <div class="run-details">
            <template v-if="selectedRun">
              <label class="detail-label">Comments:</label>
              <textarea class="detail-input detail-textarea" readonly :value="selectedRun.comments" />

              <label class="detail-label">Start Time:</label>
              <input class="detail-input" readonly :value="selectedRun.startTime" />

              <label class="detail-label">End Time:</label>
              <input class="detail-input" readonly :value="selectedRun.endTime" />

              <label class="detail-label">Started By:</label>
              <input class="detail-input" readonly :value="selectedRun.startedBy" />
            </template>
            <div v-else class="run-details-empty">Select a run to view details</div>
          </div>
        </div>
      </div>

      <!-- Footer buttons -->
      <div class="report-footer">
        <button class="btn btn-primary" :disabled="!selectedRun" @click="generateReport">Generate Report</button>
        <button class="btn btn-secondary" @click="emit('close')">Close</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.report-dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.28);
  width: 760px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.report-body {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 10px;
  padding: 14px;
  flex: 1;
  min-height: 0;
}

.report-group {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.report-group-header {
  background: var(--bg-table-header);
  border-bottom: 1px solid var(--border-color);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  border-radius: 3px 3px 0 0;
}

/* Run list */
.run-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.run-list-item {
  padding: 6px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  user-select: none;
}
.run-list-item:hover    { background: var(--bg-table-hover); }
.run-list-item.selected { background: var(--accent); color: #fff; }

.run-list-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

/* Run details */
.run-details {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.run-details-empty {
  font-size: 12px;
  color: var(--text-secondary);
  margin: auto;
  text-align: center;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 6px;
}
.detail-label:first-child { margin-top: 0; }

.detail-input {
  font-family: inherit;
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-input);
  color: var(--text-primary);
  width: 100%;
  resize: none;
}
.detail-input[readonly] { background: var(--bg-table-alt); cursor: default; }
.detail-textarea { height: 60px; }

/* Footer */
.report-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
}
</style>
