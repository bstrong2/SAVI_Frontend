<script setup>
  import { ref, computed, inject, watch, onUnmounted } from 'vue'
  import { LOG_LEVELS } from '../../constants/logLevels.js'
  import { ITEM_TYPES } from '../../constants/devices.js'
  import { RUN_STATUS } from '../../constants/runStatus.js'
  import { Line } from 'vue-chartjs'
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'

  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

  /////////////////////////////////////////////
  // Define variables.
  const selectedSensorId = ref(null)
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
  const addLog = inject('addLog', (msg, level) => console.error(msg))


  /////////////////////////////////////////////
  // Define computed properties.

  // Having this as it makes the code a little easier to read when we do this.
  const isLogOnlyMode = computed(() => loggedSensors.value.length > 0)

  const allCanvasSensors = computed(() =>
    (layoutItems?.value ?? []).filter(i => i.type === ITEM_TYPES.Sensor)
  )

  // In log-only mode show only logged sensors; otherwise all canvas sensors
  const displaySensors = computed(() =>
    isLogOnlyMode.value ? loggedSensors.value : allCanvasSensors.value
  )

  const startedBy = computed(() => runInfo?.value?.startedBy ?? '—')
  const startedAt = computed(() => runInfo?.value?.startedAt ?? '—')
  const status = computed(() => runInfo?.value?.status ?? RUN_STATUS.Idle)

  // Having a constant for the chart values, can make it computed if things need to be changed in the settings later.
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: {
        display: true,
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
  }



  /////////////////////////////////////////////
  // Watch for changes.
  watch(displaySensors, (list) => {
    if (!list.find(s => s.id === selectedSensorId.value))
      selectedSensorId.value = list[0]?.id ?? null
  }, { immediate: true })

  // On mount and whenever dbRunId changes... Load the active run, or fall back to the most recent historical one.
  watch(() => runInfo.value?.dbRunId, async (newId) => {
    if (newId) {
      await loadChartFromDb(newId)
    } else if (runState.value === RUN_STATUS.Idle) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/runs`)

        if (response.ok) {
          const runs = await response.json()
          const run = runs.find(r => r.readingCount > 0)

          if (run)
            await loadChartFromDb(run.id)
        } else {
          addLog(`Failed to load runs (HTTP ${response.status})`, LOG_LEVELS.Warning)
        }
      } catch (e) {
        addLog(`Failed to load runs: ${e.message}`, LOG_LEVELS.Warning)
      }
    }
  }, { immediate: true })

  // When a run stops, reload from DB so the completed run's data appears on the chart.
  watch(runState, async (newState, oldState) => {
    if (newState === RUN_STATUS.Idle && oldState !== RUN_STATUS.Idle) {
      const dbRunId = runInfo?.value?.dbRunId

      if (dbRunId) 
        await loadChartFromDb(dbRunId)
    }
  })

  // Handle signalR during reconnects
  watch(connection, (conn, prevConn) => {
    prevConn?.off('SensorUpdate', handleSensorUpdate)
    conn?.on('SensorUpdate', handleSensorUpdate)
  }, { immediate: true })


  // Disconnect the signalR.
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
    const [datePart, timePart] = dbTime.split(' ')
    const [, month, day] = datePart.split('-')
    return `${day}/${month} ${timePart}`
  }

  async function loadChartFromDb(runId) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/runs/${runId}`)

      // If we don't get a good response back then don't graph any data.
      if (!response.ok) {
        addLog(`Failed to load run data (HTTP ${response.status})`, LOG_LEVELS.Warning)
        return
      }

      const details = await response.json()
      const readings = details.readings ?? []
      if (readings.length === 0) 
        return

      const byName = {}
      const labelSet = new Set()

      // The graph should only display the amount of data that we have in the max points setting...
      // For that reason take the data that was aquired through the database iterate over it and only load that
      // part into the list so we can display it.
      for (let i = readings.length - 1; i >= 0; i--) {

        const rd = readings[i]
        const label = dbTimeToLabel(rd.insertTime)
        labelSet.add(label)

        if (!byName[rd.sensorName])
          byName[rd.sensorName] = {}

        byName[rd.sensorName][label] = rd.value

        if (labelSet.size === MAX_POINTS) 
          break
      }
      const allLabels = [...labelSet].reverse()

      const currentDatasets = chartData.value.datasets
      const hasNameMatch = currentDatasets.some(ds => byName[ds.label] != null)

      // Check to see if we are currently doing a run.
      if (details.status === RUN_STATUS.Running && hasNameMatch) {

        chartData.value = {
          labels: allLabels,
          datasets: currentDatasets.map(ds => ({
            ...ds,
            data: allLabels.map(t => byName[ds.label]?.[t] ?? null),
          })),
        }
      } else {
        // No run is going, display just the database data.
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
    } catch (e) {
      addLog(`Failed to load chart data: ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  function fmtDateTime(d = new Date()) {
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  // Function to be run when a value gets passed through signalR. This will handle the shifting of the data
  // for the chart as well.
  function handleSensorUpdate(sensorId, value) {

    if (isLogOnlyMode.value)
      return

    if (sensorId !== selectedSensorId.value)
      return

    const ds = chartData.value.datasets[0]
    if (!ds) 
      return

    const newLabels = [...chartData.value.labels, fmtDateTime()]
    const newData = [...ds.data, value]

    if (newLabels.length > MAX_POINTS) 
      newLabels.shift()
    if (newData.length > MAX_POINTS) 
      newData.shift()

    chartData.value = {
      labels: newLabels,
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
      <div v-if="!chartData.datasets.some(ds => ds.data.length > 0)" class="chart-empty">
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

  /* Outer flex row: chart on the left, run info panel on the right. */
  .logging-details {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* Flex column that fills all space to the left of the run info panel,
     containing the chart with a relative position for the empty state overlay. */
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

  /* Fixed width right panel showing run metadata (started by, started at, status). */
  .details-right {
    width: 190px;
    flex-shrink: 0;
    padding: 12px;
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
  }
  .details-right .form-field {
     margin-bottom: 12px; 
    }
  /* Small muted label above each read-only field in the run info panel. */
  .details-right label {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 3px;
  }
</style>
