<script setup>
import { ref, onMounted, inject } from 'vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'
const addLog      = inject('addLog', (msg, level) => console.error(msg))

const emit = defineEmits(['close'])

const runs                = ref([])
const loading             = ref(true)
const separateSensorFiles = ref(false)

const selectedRun = ref(null)

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/runs`)
    if (res.ok) {
      runs.value = await res.json()
      selectedRun.value = runs.value[0] ?? null
    }
  } catch { /* backend unreachable */ }
  finally { loading.value = false }
})

async function generateReport() {
  if (!selectedRun.value) return
  const r   = selectedRun.value
  const BOM = '﻿'

  try {
    // Fetch full run details (includes sensor readings)
    let readings = []
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${r.id}`)
      if (res.ok) {
        readings = (await res.json()).readings ?? []
      } else {
        addLog(`Report: failed to fetch run data (HTTP ${res.status})`, 'Warning')
      }
    } catch (err) {
      addLog(`Report: could not reach backend — ${err.message}`, 'Error')
    }

    const q        = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const baseName = r.name.replace(/\s+/g, '_')

    const metaRows = [
      ['Run',        q(r.name)],
      ['Status',     q(r.status ?? '')],
      ['Started By', q(r.startedBy)],
      ['Start Time', q(r.startTime)],
      ['End Time',   q(r.endTime ?? '(still running)')],
      ['Comments',   q(r.comments || '')],
    ]

    function sensorLines(sensorName, sensorReadings) {
      return [
        metaRows[0],
        ['Sensor', q(sensorName)],
        ...metaRows.slice(1),
        [],
        ['Time', 'Value'],
        ...sensorReadings.map(rd => [q(rd.insertTime), rd.value]),
      ].map(row => row.join(',')).join('\r\n')
    }

    function combinedLines() {
      return [
        ...metaRows,
        [],
        ['Time', 'Sensor', 'Value'],
        ...readings.map(rd => [q(rd.insertTime), q(rd.sensorName), rd.value]),
      ].map(row => row.join(',')).join('\r\n')
    }

    function triggerDownload(content, filename) {
      const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    }

    const sensorNames = [...new Set(readings.map(rd => rd.sensorName))]

    if (separateSensorFiles.value) {
      sensorNames.forEach((sensorName, i) => {
        const safeName       = sensorName.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_')
        const sensorReadings = readings.filter(rd => rd.sensorName === sensorName)
        setTimeout(() => triggerDownload(sensorLines(sensorName, sensorReadings), `${baseName}_report_${safeName}.csv`), i * 200)
      })
    } else {
      triggerDownload(combinedLines(), `${baseName}_report.csv`)
    }
  } catch (err) {
    addLog(`Report generation failed: ${err.message}`, 'Error')
  }
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
            <div v-if="loading" class="run-list-empty">Loading…</div>
            <div v-else-if="runs.length === 0" class="run-list-empty">No runs available</div>
          </div>
        </div>

        <!-- Right: Run Details -->
        <div class="report-group">
          <div class="report-group-header">Run Details</div>
          <div class="run-details">
            <label class="detail-label">Recipe:</label>
            <input class="detail-input" readonly :value="selectedRun?.recipeName ?? ''" />

            <label class="detail-label">Comments:</label>
            <textarea class="detail-input detail-textarea" readonly :value="selectedRun?.comments ?? ''" />

            <label class="detail-label">Start Time:</label>
            <input class="detail-input" readonly :value="selectedRun?.startTime ?? ''" />

            <label class="detail-label">End Time:</label>
            <input class="detail-input" readonly :value="selectedRun?.endTime ?? ''" />

            <label class="detail-label">Started By:</label>
            <input class="detail-input" readonly :value="selectedRun?.startedBy ?? ''" />
          </div>
        </div>
      </div>

      <!-- Footer buttons -->
      <div class="report-footer">
        <label class="separate-files-label">
          <input type="checkbox" v-model="separateSensorFiles" />
          Separate Sensor Files
        </label>
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
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
}

.separate-files-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

</style>
