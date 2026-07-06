<script setup>
  import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
  import { LOG_LEVELS, RUN_STATUS, RUN_COMMANDS } from '../../constants/enums.js'
  import { ITEM_TYPES, DRIVERS } from '../../constants/devices.js'
  import { CHART_PALETTE, MAX_CHART_POINTS, chartHexToRgba } from '../../constants/chart.js'
  import { COLORS } from '../../constants/colors.js'
  import { Line } from 'vue-chartjs'
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
  import StartRunDialog from '../StartRunDialog.vue'
  import LogOnlyDialog from '../LogOnlyDialog.vue'

  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

  /////////////////////////////////////////////
  // Injected from App.vue
  const connection        = inject('connection')
  const layoutItems       = inject('layoutItems')
  const runInfo           = inject('runInfo')
  const runState          = inject('runState')
  const loggedSensors     = inject('loggedSensors')
  const chartPlotInterval = inject('chartPlotInterval')
  const authToken         = inject('authToken')
  const devices           = inject('devices')
  const BACKEND_URL       = inject('BACKEND_URL')
  const addLog            = inject('addLog', (msg, level) => console.error(msg))
  const showStartRunDialog = inject('showStartRunDialog')
  const showLogOnlyDialog  = inject('showLogOnlyDialog')
  const resolveDeviceId    = inject('resolveDeviceId')
  const handleRunCommand   = inject('handleRunCommand')

  /////////////////////////////////////////////
  // Local state
  const selectedSensorId = ref(null)
  let lastChartPlotMs = 0

  const chartData = ref({
    labels: [],
    datasets: [{
      label: 'Sensor Value',
      data: [],
      borderColor: COLORS.blue,
      backgroundColor: chartHexToRgba(COLORS.blue, 0.08),
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 2,
      fill: true,
    }],
  })


  /////////////////////////////////////////////
  // Computed
  const isLogOnlyMode = computed(() => loggedSensors.value.length > 0)

  const allCanvasSensors = computed(() =>
    (layoutItems?.value ?? []).filter(i => i.type === ITEM_TYPES.Sensor)
  )

  const displaySensors = computed(() =>
    isLogOnlyMode.value ? loggedSensors.value : allCanvasSensors.value
  )

  const startedBy = computed(() => runInfo?.value?.startedBy ?? '—')
  const startedAt = computed(() => runInfo?.value?.startedAt ?? '—')
  const status    = computed(() => runInfo?.value?.status    ?? RUN_STATUS.Idle)

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: {
        display: true,
        labels: { font: { size: 11 } },
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
  // Watches

  watch(displaySensors, (list) => {
    if (!list.find(s => s.id === selectedSensorId.value))
      selectedSensorId.value = list[0]?.id ?? null
  }, { immediate: true })

  // Rebuild chart datasets when logged sensors change.
  // sensors non-empty → empty (run stops): preserve chart data for review.
  // sensors empty from idle: reset to single-line default.
  watch(loggedSensors, (sensors, prevSensors) => {
    if (sensors.length > 0) {
      chartData.value = {
        labels: [],
        datasets: sensors.map((s, i) => ({
          sensorId: s.id,
          label: s.name,
          data: [],
          borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
          backgroundColor: chartHexToRgba(CHART_PALETTE[i % CHART_PALETTE.length], 0.08),
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2,
          fill: sensors.length === 1,
        })),
      }
    } else if (!prevSensors || prevSensors.length === 0) {
      chartData.value = {
        labels: [],
        datasets: [{
          label: 'Sensor Value',
          data: [],
          borderColor: COLORS.blue,
          backgroundColor: chartHexToRgba(COLORS.blue, 0.08),
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2,
          fill: true,
        }],
      }
    }
  }, { immediate: true })

  // Reset chart plot throttle when interval setting changes.
  watch(chartPlotInterval, () => { lastChartPlotMs = 0 })

  // Load chart from DB on mount and whenever dbRunId changes.
  watch(() => runInfo.value?.dbRunId, async (newId) => {
    if (newId) {
      await loadChartFromDb(newId)
    } else if (runState.value === RUN_STATUS.Idle) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/runs`)

        if (response.ok) {
          const runs = await response.json()
          const run = runs.find(r => r.readingCount > 0)
          if (run) await loadChartFromDb(run.id)
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
      if (dbRunId) await loadChartFromDb(dbRunId)
    }
  })

  // Register/re-register SignalR handlers on connection change.
  watch(connection, (conn, prevConn) => {
    prevConn?.off('SensorUpdate', handleSensorUpdate)
    prevConn?.off('SimulatedSensorState', handleSimulatedSensorState)

    conn?.on('SensorUpdate', handleSensorUpdate)
    conn?.on('SimulatedSensorState', handleSimulatedSensorState)
    conn?.onreconnected(handleDiReconnect)
  }, { immediate: true })

  onUnmounted(() => {
    connection?.value?.off('SensorUpdate', handleSensorUpdate)
    connection?.value?.off('SimulatedSensorState', handleSimulatedSensorState)
  })

  onMounted(restoreRunState)

  // Storing the run state in local storage if we aren't idle. On refresh, less latency than
  // re-querying the backend for data we already have.
  watch(
    [runState, runInfo],
    ([state, info]) => {
      if (state !== RUN_STATUS.Idle && info) {
        localStorage.setItem('savi-run', JSON.stringify({ runState: state, runInfo: info }))
      } else {
        localStorage.removeItem('savi-run')
      }
    },
    { deep: true }
  )

  async function restoreRunState() {
    const stored = localStorage.getItem('savi-run')
    if (!stored) return

    try {
      const { runState: savedState, runInfo: savedInfo } = JSON.parse(stored)
      const dbRunId = savedInfo?.dbRunId
      if (!dbRunId) { localStorage.removeItem('savi-run'); return }

      const response = await fetch(`${BACKEND_URL}/api/runs/${dbRunId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.status === RUN_STATUS.Running) {
          runInfo.value  = savedInfo
          runState.value = savedState
          addLog(`Run #${dbRunId} restored — logging is active`, LOG_LEVELS.Info)
        } else {
          localStorage.removeItem('savi-run')
        }
      } else {
        addLog(`Failed to restore run state (HTTP ${response.status})`, LOG_LEVELS.Warning)
        localStorage.removeItem('savi-run')
      }
    } catch (e) {
      addLog(`Failed to restore run state: ${e.message}`, LOG_LEVELS.Warning)
      localStorage.removeItem('savi-run')
    }
  }


  /////////////////////////////////////////////
  // Chart helpers

  function dbTimeToLabel(dbTime) {
    const [datePart, timePart] = dbTime.split(' ')
    const [, month, day] = datePart.split('-')
    return `${day}/${month} ${timePart}`
  }

  function fmtDateTime(d = new Date()) {
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  async function loadChartFromDb(runId) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/runs/${runId}`)

      if (!response.ok) {
        addLog(`Failed to load run data (HTTP ${response.status})`, LOG_LEVELS.Warning)
        return
      }

      const details = await response.json()
      const readings = details.readings ?? []
      if (readings.length === 0) return

      const byName = {}
      const labelSet = new Set()

      for (let i = readings.length - 1; i >= 0; i--) {
        const rd = readings[i]
        const label = dbTimeToLabel(rd.insertTime)
        labelSet.add(label)

        if (!byName[rd.sensorName]) byName[rd.sensorName] = {}
        byName[rd.sensorName][label] = rd.value

        if (labelSet.size === MAX_CHART_POINTS) break
      }
      const allLabels = [...labelSet].reverse()

      const currentDatasets = chartData.value.datasets
      const hasNameMatch = currentDatasets.some(ds => byName[ds.label] != null)

      if (details.status === RUN_STATUS.Running && hasNameMatch) {
        chartData.value = {
          labels: allLabels,
          datasets: currentDatasets.map(ds => ({
            ...ds,
            data: allLabels.map(t => byName[ds.label]?.[t] ?? null),
          })),
        }
      } else {
        const names = Object.keys(byName)
        chartData.value = {
          labels: allLabels,
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

  function pushChartPoint(sensorId, value) {
    const datasets = chartData.value.datasets
    const idx = datasets.findIndex(ds => ds.sensorId === sensorId)
    if (idx === -1) return

    const label = fmtDateTime()
    const newData = [...datasets[idx].data, value]
    if (newData.length > MAX_CHART_POINTS) newData.shift()

    const newDatasets = datasets.map((ds, i) => i === idx ? { ...ds, data: newData } : { ...ds })
    const newLabels = [...chartData.value.labels, label]
    if (newLabels.length > MAX_CHART_POINTS) newLabels.shift()

    chartData.value = { labels: newLabels, datasets: newDatasets }

    const dbRunId = runInfo.value?.dbRunId
    if (dbRunId && authToken.value) {
      fetch(`${BACKEND_URL}/api/run/${dbRunId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken.value}` },
        body: JSON.stringify({ readings: [{ canvasId: sensorId, value }] }),
      }).catch(e => addLog(`Failed to write reading to DB: ${e.message}`, LOG_LEVELS.Warning))
    }
  }


  /////////////////////////////////////////////
  // SignalR handlers

  function handleSensorUpdate(sensorId, value) {
    const tile = layoutItems.value?.find(i => i.id === sensorId && i.type === ITEM_TYPES.Sensor)
    if (tile) {
      if (tile.driver === DRIVERS.CollisionDetector) tile.value = value >= 0.5 ? 'Collision!' : 'No Contact'
      else if (tile.driver === DRIVERS.Relay) tile.relayState = value >= 0.5 ? 'on' : 'off'
    }

    if (isLogOnlyMode.value) return
    if (sensorId !== selectedSensorId.value) return

    const ds = chartData.value.datasets[0]
    if (!ds) return

    const newLabels = [...chartData.value.labels, fmtDateTime()]
    const newData   = [...ds.data, value]

    if (newLabels.length > MAX_CHART_POINTS) newLabels.shift()
    if (newData.length  > MAX_CHART_POINTS) newData.shift()

    chartData.value = { labels: newLabels, datasets: [{ ...ds, data: newData }] }
  }

  function handleSimulatedSensorState(state) {
    for (const r of state.relays ?? []) {
      const item = layoutItems.value.find(i => i.type === ITEM_TYPES.Sensor && i.id === r.id && i.driver === DRIVERS.Relay && i.connection === DRIVERS.Simulated)
      if (item) item.relayState = r.state
    }
    for (const d of state.digitalInputs ?? []) {
      const item = layoutItems.value.find(i => i.type === ITEM_TYPES.Sensor && i.id === d.id && i.driver === DRIVERS.CollisionDetector && i.connection === DRIVERS.Simulated)
      if (item) item.value = d.stateLabel
    }

    if (loggedSensors.value.length === 0 || runState.value !== RUN_STATUS.Running) return

    const nowMs = Date.now()
    if (nowMs - lastChartPlotMs < chartPlotInterval.value * 1000) return
    lastChartPlotMs = nowMs

    const label = fmtDateTime()
    const valueMap = new Map()

    for (const r of state.relays ?? [])
      valueMap.set(r.id, r.state === 'on' ? 1 : 0)

    for (const d of state.digitalInputs ?? [])
      valueMap.set(d.id, d.stateLabel === 'Collision!' ? 1 : 0)

    // Real Pi sensors aren't in SimulatedSensorState — read current tile state directly.
    for (const s of loggedSensors.value) {
      if (s.connection === DRIVERS.Simulated) continue
      const tile = layoutItems.value.find(i => i.id === s.id)
      if (!tile) continue
      if (s.driver === DRIVERS.Relay)             valueMap.set(s.id, tile.relayState === 'on'       ? 1 : 0)
      if (s.driver === DRIVERS.CollisionDetector) valueMap.set(s.id, tile.value       === 'Collision!' ? 1 : 0)
    }

    let anyUpdate = false
    const newDatasets = chartData.value.datasets.map(ds => {
      if (!valueMap.has(ds.sensorId)) return { ...ds }
      anyUpdate = true
      const newData = [...ds.data, valueMap.get(ds.sensorId)]
      if (newData.length > MAX_CHART_POINTS) newData.shift()
      return { ...ds, data: newData }
    })

    if (!anyUpdate) return

    const newLabels = [...chartData.value.labels, label]
    if (newLabels.length > MAX_CHART_POINTS) newLabels.shift()
    chartData.value = { labels: newLabels, datasets: newDatasets }

    const dbRunId = runInfo.value?.dbRunId
    if (dbRunId && authToken.value) {
      const readings = loggedSensors.value
        .filter(s => valueMap.has(s.id))
        .map(s => ({ canvasId: s.id, value: valueMap.get(s.id) }))

      if (readings.length > 0) {
        fetch(`${BACKEND_URL}/api/run/${dbRunId}/readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken.value}` },
          body: JSON.stringify({ readings }),
        }).catch(e => addLog(`Failed to write readings to DB: ${e.message}`, LOG_LEVELS.Warning))
      }
    }
  }


  function handleDiReconnect() {
    for (const item of layoutItems.value) {
      if (item.type !== 'sensor' || item.driver !== DRIVERS.CollisionDetector) continue
      if (item.connection === DRIVERS.Simulated || item.pin == null) continue
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId === null) continue
      fetch(`${BACKEND_URL}/api/devices/${deviceId}/di/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: item.pin, canvasId: item.id }),
      }).catch(e => addLog(`DI monitor re-setup failed after reconnect: ${e.message}`, LOG_LEVELS.Warning))
    }
  }


  /////////////////////////////////////////////
  // Run execution

  async function callRelay(sensor, state) {
    if (!sensor) return

    try {
      if (sensor.connection === DRIVERS.Simulated) {
        await fetch(`${BACKEND_URL}/api/simulate/relay/${sensor.id}/${state ? 'on' : 'off'}`, {
          method: 'POST',
          headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
        })
      } else {
        const deviceId = resolveDeviceId(sensor.connection)
        if (deviceId !== null && sensor.pin != null) {
          await fetch(`${BACKEND_URL}/api/devices/${deviceId}/do`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: sensor.pin, state, canvasId: sensor.id }),
          })
        }
      }
    } catch (e) {
      addLog(`Relay command failed: ${e.message}`, LOG_LEVELS.Warning)
    }

    // Mirror tile state and push chart point — real Pi relays have no SimulatedSensorState broadcast.
    const tile = layoutItems.value.find(i => i.id === sensor.id)
    if (tile) tile.relayState = state ? 'on' : 'off'
    pushChartPoint(sensor.id, state ? 1 : 0)
  }

  async function executeRecipe(recipe, doSensor, diSensor) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    addLog(`Executing recipe: ${recipe.name} (${recipe.steps.length} steps)`, LOG_LEVELS.Info)

    for (const step of recipe.steps) {
      if (runState.value !== RUN_STATUS.Running) break
      if (step.action === 'relay/on')  await callRelay(doSensor, true)
      if (step.action === 'relay/off') await callRelay(doSensor, false)
      await delay(step.durationMs)
    }

    if (doSensor) await callRelay(doSensor, false)

    if (runState.value === RUN_STATUS.Running) {
      addLog(`Recipe complete — stopping run`, LOG_LEVELS.Info)
      handleRunCommand(RUN_COMMANDS.Stop)
    }
  }

  async function handleStartConfirmed(info) {
    const recipeSensors = [info.doSensor, info.diSensor].filter(Boolean)

    for (const s of recipeSensors) {
      const endpoint = s.connection === DRIVERS.Simulated
        ? `${BACKEND_URL}/api/simulate/register`
        : `${BACKEND_URL}/api/sensors/register-canvas`
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId: s.id, name: s.name, driver: s.driver }),
      }).catch(e => addLog(`Sensor pre-registration failed: ${e.message}`, LOG_LEVELS.Warning))
    }

    runState.value = RUN_STATUS.Running
    runInfo.value = {
      startedBy: info.startedBy,
      startedAt: new Date().toLocaleTimeString(),
      notes: info.notes,
      recipeName: info.recipeName,
      status: RUN_STATUS.Running,
      dbRunId: null,
      selectedSensors: recipeSensors,
      doSensorId: info.doSensor?.id ?? null,
    }
    showStartRunDialog.value = false

    const sensorNames = recipeSensors.map(s => s.name).join(', ') || 'none'
    addLog(`Run started by ${info.startedBy} — Recipe: ${info.recipeName} — Sensors: ${sensorNames}`, LOG_LEVELS.Info)

    let recipe = null
    try {
      const response = await fetch(`${BACKEND_URL}/api/run/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {}),
        },
        body: JSON.stringify({ recipeName: info.recipeName, startedBy: info.startedBy, notes: info.notes }),
      })

      if (response.ok) {
        const data = await response.json()
        runInfo.value = { ...runInfo.value, dbRunId: parseInt(data.runId) }
        recipe = data.recipe ?? null
      } else {
        addLog(`Failed to create run record (HTTP ${response.status})`, LOG_LEVELS.Warning)
      }
    } catch (e) {
      addLog(`Failed to create run record: ${e.message}`, LOG_LEVELS.Warning)
    }

    if (recipe?.steps?.length) executeRecipe(recipe, info.doSensor, info.diSensor)
  }

  async function handleLogOnlyConfirmed(info) {
    runState.value = RUN_STATUS.Running
    runInfo.value = {
      startedBy: info.startedBy,
      startedAt: new Date().toLocaleTimeString(),
      notes: info.notes,
      recipeName: null,
      status: RUN_STATUS.Logging,
      selectedSensors: info.selectedSensors,
      dbRunId: null,
    }
    showLogOnlyDialog.value = false
    addLog(
      `Log-only started by ${info.startedBy} — ${info.selectedSensors.length} sensor(s): ` +
      info.selectedSensors.map(s => s.name).join(', '),
      LOG_LEVELS.Info
    )

    try {
      const response = await fetch(`${BACKEND_URL}/api/run/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {}),
        },
        body: JSON.stringify({ recipeName: 'Log Only', startedBy: info.startedBy, notes: info.notes }),
      })

      if (response.ok) {
        const data = await response.json()
        runInfo.value = { ...runInfo.value, dbRunId: parseInt(data.runId) }
      } else {
        addLog(`Failed to create run record (HTTP ${response.status})`, LOG_LEVELS.Warning)
      }
    } catch (e) {
      addLog(`Failed to create run record: ${e.message}`, LOG_LEVELS.Warning)
    }
  }
</script>

<template>
  <div class="logging-details">

    <!-- Center: chart -->
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

    <!-- Right panel — run info -->
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

  <StartRunDialog v-if="showStartRunDialog" @confirm="handleStartConfirmed" @cancel="showStartRunDialog.value = false" />
  <LogOnlyDialog  v-if="showLogOnlyDialog"  @confirm="handleLogOnlyConfirmed" @cancel="showLogOnlyDialog.value = false" />
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

  .logging-details {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .details-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px;
    min-width: 0;
    position: relative;
  }

  .chart-container {
    flex: 1;
    position: relative;
    min-height: 0;
  }

  .details-right {
    width: 190px;
    flex-shrink: 0;
    padding: 12px;
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
  }
  .details-right .form-field { margin-bottom: 12px; }
  .details-right label {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 3px;
  }
</style>
