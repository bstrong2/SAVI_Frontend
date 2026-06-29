<script setup>
  import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
  import { Line } from 'vue-chartjs'
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'

  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

  /////////////////////////////////////////////
  // Define variables.
  const selectedSensorId = ref(null)
  const showLegend = ref(false)
  const MAX_POINTS = 120
  const CHART_PALETTE = [
    '#007ACC', '#e64a19', '#388e3c', '#7b1fa2',
    '#0097a7', '#f57c00', '#880e4f', '#558b2f',
  ]

  // injecting things that we need
  const connection = inject('connection')
  const layoutItems = inject('layoutItems')
  const runInfo = inject('runInfo')
  const runState = inject('runState')
  const chartData = inject('chartData')
  const loggedSensors = inject('loggedSensors')
  const BACKEND_URL = inject('BACKEND_URL')


  /////////////////////////////////////////////
  // Define computed properties.
  const isLogOnlyMode = computed(() => loggedSensors.value.length > 0)

  const allCanvasSensors = computed(() =>
    (layoutItems?.value ?? []).filter(i => i.type === 'sensor')
  )

  // In log-only mode show only logged sensors; otherwise all canvas sensors
  const displaySensors = computed(() =>
    isLogOnlyMode.value ? loggedSensors.value : allCanvasSensors.value
  )

  const startedBy = computed(() => runInfo?.value?.startedBy ?? '—')
  const startedAt = computed(() => runInfo?.value?.startedAt ?? '—')
  const status    = computed(() => runInfo?.value?.status    ?? 'Idle')

  // Does NOT read chartData directly — avoids triggering a simultaneous options+data change
  // that would cause vue-chartjs to reinitialise the chart on every broadcast tick.
  const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
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
          maxRotation: 45,
          minRotation: 0,
          font: { size: 9 },
        },
      },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 } },
      },
    },
  }))

  const hasData = computed(() =>
    chartData.value.datasets.some(ds => ds.data.length > 0)
  )


  /////////////////////////////////////////////
  // Watch for changes.
  watch(displaySensors, (list) => {
    if (!list.find(s => s.id === selectedSensorId.value))
      selectedSensorId.value = list[0]?.id ?? null
  }, { immediate: true })

  // When a run's dbRunId first becomes available (API call completed after run start),
  // load whatever readings exist so far as a baseline.
  watch(() => runInfo.value?.dbRunId, async (newId, oldId) => {
    if (newId && !oldId) await loadChartFromDb(newId)
  })

  // When a run stops, reload from DB so the completed run's data appears on the chart.
  watch(runState, async (newState, oldState) => {
    if (newState === 'idle' && oldState !== 'idle') {
      const dbRunId = runInfo?.value?.dbRunId
      if (dbRunId) await loadChartFromDb(dbRunId)
    }
  })

  // Tracks whether the legend should be shown — updated only when dataset count changes,
  // not on every live-data push (avoids re-creating chartOptions on every tick).
  watch(() => chartData.value.datasets.length, n => { showLegend.value = n > 1 }, { immediate: true })

  // SimulatedSensorState is handled by App.vue (persistent across navigation).
  watch(connection, (conn, prevConn) => {
    prevConn?.off('SensorUpdate', handleSensorUpdate)
    conn?.on(     'SensorUpdate', handleSensorUpdate)
  }, { immediate: true })


  /////////////////////////////////////////////
  // Mounts
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

  onUnmounted(() => {
    connection?.value?.off('SensorUpdate', handleSensorUpdate)
  })


  /////////////////////////////////////////////
  // Defining all functions.

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
      if (!res.ok) 
        return

      const details = await res.json()
      const readings = details.readings ?? []
      if (readings.length === 0) 
        return

      // Build per-sensor lookup: name → { label → value }
      const byName = {}
      for (const rd of readings) {
        const label = dbTimeToLabel(rd.insertTime)
        if (!byName[rd.sensorName]) byName[rd.sensorName] = {}
        byName[rd.sensorName][label] = rd.value
      }

      // Unique time labels in chronological order, capped at MAX_POINTS
      let allLabels = [...new Set(readings.map(rd => dbTimeToLabel(rd.insertTime)))]
      if (allLabels.length > MAX_POINTS) 
        allLabels = allLabels.slice(-MAX_POINTS)

      const currentDatasets = chartData.value.datasets
      const hasNameMatch = currentDatasets.some(ds => byName[ds.label] != null)

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
            label: name,
            data: allLabels.map(t => byName[name][t] ?? null),
            borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
            backgroundColor: chartHexToRgba(CHART_PALETTE[i % CHART_PALETTE.length], 0.08),
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2,
            fill: names.length === 1,
          })),
        }
      }
    } catch
      { /* backend unreachable */ }
  }

  function fmtDateTime(d = new Date()) {
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  // Immutable array replacement so Chart.js always sees fresh references.
  // Only used when a recipe is running (not in log-only mode).
  function handleSensorUpdate(sensorId, value) {
    if (isLogOnlyMode.value)
      return

    if (sensorId !== selectedSensorId.value)
      return

    const ds = chartData.value.datasets[0]
    if (!ds) return

    const newLabels = [...chartData.value.labels, fmtDateTime()]
    const newData   = [...ds.data, value]

    if (newLabels.length > MAX_POINTS) 
      newLabels.shift()
    if (newData.length   > MAX_POINTS) 
      newData.shift()

    chartData.value = {
      labels:   newLabels,
      datasets: [{ ...ds, data: newData }],
    }
  }
</script>

<template>
  <div class="logging-details">

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

  /*
   * ==========================================
   * Logging Details layout
   * ==========================================
   */

  /* Outer flex row: chart on the left, run info panel on the right. */
  .logging-details {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* Flex column that fills all space to the left of the run info panel,
     containing the chart with a relative position for the empty-state overlay. */
  .details-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px;
    min-width: 0;
    position: relative;
  }

  /* Fills all available vertical space so the Chart.js canvas stretches to fit. */
  .chart-container {
    flex: 1;
    position: relative;
    min-height: 0;
  }

  /* Fixed-width right panel showing run metadata (started by, started at, status). */
  .details-right {
    width: 190px;
    flex-shrink: 0;
    padding: 12px;
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
  }
  .details-right .form-field { margin-bottom: 12px; }
  /* Small muted label above each read-only field in the run info panel. */
  .details-right label {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 3px;
  }
</style>
