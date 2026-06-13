<script setup>
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const connection    = inject('connection')
const layoutItems   = inject('layoutItems')
const runInfo       = inject('runInfo')
const runState      = inject('runState')       // 'idle' | 'running' | 'paused'
const chartData     = inject('chartData')      // persistent ref owned by App.vue
const loggedSensors = inject('loggedSensors')  // computed ref owned by App.vue
const BACKEND_URL   = inject('BACKEND_URL')

// ── Mode detection ──────────────────────────────────────────────────────────

const isLogOnlyMode = computed(() => loggedSensors.value.length > 0)

// ── Sensor list for the left-panel detail picker ────────────────────────────

const allCanvasSensors = computed(() =>
  (layoutItems?.value ?? []).filter(i => i.type === 'sensor')
)

// In log-only mode show only logged sensors; otherwise all canvas sensors
const displaySensors = computed(() =>
  isLogOnlyMode.value ? loggedSensors.value : allCanvasSensors.value
)

const selectedSensorId = ref(null)

watch(displaySensors, (list) => {
  if (!list.find(s => s.id === selectedSensorId.value)) {
    selectedSensorId.value = list[0]?.id ?? null
  }
}, { immediate: true })

const selectedSensorObj = computed(() =>
  displaySensors.value.find(s => s.id === selectedSensorId.value) ?? null
)

const units  = computed(() => selectedSensorObj.value?.unit       ?? '—')
const ipAddr = computed(() => selectedSensorObj.value?.connection ?? '—')
const driver = computed(() => selectedSensorObj.value?.driver     ?? '—')

const startedBy = computed(() => runInfo?.value?.startedBy ?? '—')
const startedAt = computed(() => runInfo?.value?.startedAt ?? '—')
const status    = computed(() => runInfo?.value?.status    ?? 'Idle')

// ── Historical data loading ─────────────────────────────────────────────────

const CHART_PALETTE = [
  '#007ACC', '#e64a19', '#388e3c', '#7b1fa2',
  '#0097a7', '#f57c00', '#880e4f', '#558b2f',
]

function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function dbTimeToLabel(dbTime) {
  // "2026-06-12 14:23:45" → "12/06 14:23:45" (matches live update label format)
  const [datePart, timePart] = dbTime.split(' ')
  const [, month, day] = datePart.split('-')
  return `${day}/${month} ${timePart}`
}

async function loadChartFromDb(runId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/runs/${runId}`)
    if (!res.ok) return
    const details = await res.json()
    const readings = details.readings ?? []
    if (readings.length === 0) return

    // Build per-sensor lookup: name → { label → value }
    const byName = {}
    for (const rd of readings) {
      const label = dbTimeToLabel(rd.insertTime)
      if (!byName[rd.sensorName]) byName[rd.sensorName] = {}
      byName[rd.sensorName][label] = rd.value
    }

    // Unique time labels in chronological order, capped at MAX_POINTS
    let allLabels = [...new Set(readings.map(rd => dbTimeToLabel(rd.insertTime)))]
    if (allLabels.length > MAX_POINTS) allLabels = allLabels.slice(-MAX_POINTS)

    const currentDatasets = chartData.value.datasets
    const hasNameMatch    = currentDatasets.some(ds => byName[ds.label] != null)

    if (hasNameMatch) {
      // Active / just-stopped run: overlay DB data onto existing datasets.
      // Preserves ds.sensorId so App.vue live updates continue to work.
      chartData.value = {
        labels:   allLabels,
        datasets: currentDatasets.map(ds => ({
          ...ds,
          data: allLabels.map(t => byName[ds.label]?.[t] ?? null),
        })),
      }
    } else {
      // Idle / historical: build fresh datasets from DB readings
      const names = Object.keys(byName)
      chartData.value = {
        labels:   allLabels,
        datasets: names.map((name, i) => ({
          label:           name,
          data:            allLabels.map(t => byName[name][t] ?? null),
          borderColor:     CHART_PALETTE[i % CHART_PALETTE.length],
          backgroundColor: chartHexToRgba(CHART_PALETTE[i % CHART_PALETTE.length], 0.08),
          borderWidth:     2,
          tension:         0.3,
          pointRadius:     2,
          fill:            names.length === 1,
        })),
      }
    }
  } catch { /* backend unreachable */ }
}

onMounted(async () => {
  const dbRunId = runInfo.value?.dbRunId
  if (dbRunId) {
    // Run is active (or was just stopped): load its full readings from DB
    await loadChartFromDb(dbRunId)
  } else {
    // No run in memory — show the most recent completed run from DB
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs`)
      if (res.ok) {
        const runs = await res.json()
        if (runs.length > 0) await loadChartFromDb(runs[0].id)
      }
    } catch { /* backend unreachable */ }
  }
})

// When a run's dbRunId first becomes available (API call completed after run start),
// load whatever readings exist so far as a baseline.
watch(() => runInfo.value?.dbRunId, async (newId, oldId) => {
  if (newId && !oldId) await loadChartFromDb(newId)
})

// ── Chart options ───────────────────────────────────────────────────────────
// Does NOT read chartData directly — avoids triggering a simultaneous options+data change
// that would cause vue-chartjs to reinitialise the chart on every broadcast tick.

// Tracks whether the legend should be shown — updated only when dataset count changes,
// NOT on every live-data push (avoids re-creating chartOptions on every tick).
const showLegend = ref(false)
watch(() => chartData.value.datasets.length, n => { showLegend.value = n > 1 }, { immediate: true })

const chartOptions = computed(() => ({
  responsive:          true,
  maintainAspectRatio: false,
  animation:           { duration: 0 },
  plugins: {
    legend: {
      display: showLegend.value,
      labels:  { font: { size: 11 } },
    },
  },
  scales: {
    x: {
      ticks: {
        maxTicksLimit: 6,
        maxRotation:   45,
        minRotation:   0,
        font:          { size: 9 },
      },
    },
    y: {
      beginAtZero: true,
      ticks:       { font: { size: 10 } },
    },
  },
}))

const hasData = computed(() =>
  chartData.value.datasets.some(ds => ds.data.length > 0)
)

// ── SensorUpdate handler — recipe / generic sensor mode ────────────────────
//   Immutable array replacement so Chart.js always sees fresh references.
//   Only used when a recipe is running (not in log-only mode).

const MAX_POINTS = 120

function fmtDateTime(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function handleSensorUpdate(sensorId, value) {
  if (isLogOnlyMode.value) return
  if (sensorId !== selectedSensorId.value) return

  const ds = chartData.value.datasets[0]
  if (!ds) return

  const newLabels = [...chartData.value.labels, fmtDateTime()]
  const newData   = [...ds.data, value]
  if (newLabels.length > MAX_POINTS) newLabels.shift()
  if (newData.length   > MAX_POINTS) newData.shift()

  chartData.value = {
    labels:   newLabels,
    datasets: [{ ...ds, data: newData }],
  }
}

// ── SignalR listener — SensorUpdate only ────────────────────────────────────
// SimulatedSensorState is handled by App.vue (persistent across navigation).

watch(connection, (conn, prevConn) => {
  prevConn?.off('SensorUpdate', handleSensorUpdate)
  conn?.on(     'SensorUpdate', handleSensorUpdate)
}, { immediate: true })

onUnmounted(() => {
  connection?.value?.off('SensorUpdate', handleSensorUpdate)
})
</script>

<template>
  <div class="logging-details">

    <!-- Left panel — sensor detail picker ──────────────────────────────── -->
    <div class="details-left">
      <div class="form-field">
        <label>{{ isLogOnlyMode ? 'Logged Sensor' : 'Sensor' }}</label>
        <select v-model="selectedSensorId">
          <option v-if="displaySensors.length === 0" :value="null" disabled>
            {{ isLogOnlyMode ? 'No sensors selected' : 'No sensors on canvas' }}
          </option>
          <option v-for="s in displaySensors" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="form-field">
        <label>Units</label>
        <input type="text" :value="units" readonly />
      </div>
      <div class="form-field">
        <label>Connection</label>
        <input type="text" :value="ipAddr" readonly />
      </div>
      <div class="form-field">
        <label>Driver</label>
        <input type="text" :value="driver" readonly />
      </div>

      <div v-if="isLogOnlyMode" class="logging-badge">
        📝 {{ loggedSensors.length }} sensor{{ loggedSensors.length === 1 ? '' : 's' }} logging
      </div>
    </div>

    <!-- Center: chart ───────────────────────────────────────────────────── -->
    <div class="details-center">
      <div class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <div v-if="!hasData" class="chart-empty">
        {{
          isLogOnlyMode
            ? 'Logging started — waiting for first data point…'
            : 'No data — waiting for sensor updates via SignalR'
        }}
      </div>
    </div>

    <!-- Right panel — run info ──────────────────────────────────────────── -->
    <div class="details-right">
      <div class="form-field">
        <label>Started By</label>
        <input type="text" :value="startedBy" readonly />
      </div>
      <div class="form-field">
        <label>Started At</label>
        <input type="text" :value="startedAt" readonly />
      </div>
      <div class="form-field">
        <label>Status</label>
        <input type="text" :value="status" readonly />
      </div>
    </div>

  </div>
</template>

<style scoped>
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 12px;
  pointer-events: none;
}

.logging-badge {
  margin-top: 14px;
  padding: 6px 10px;
  border-radius: 4px;
  background: color-mix(in srgb, #0097a7 12%, transparent);
  color: #0097a7;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}
</style>
