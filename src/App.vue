<script setup>
import { ref, provide, computed, watch, onMounted, onUnmounted } from 'vue'
import * as signalR from '@microsoft/signalr'
import AppRibbon from './components/AppRibbon.vue'
import LogView from './components/LogView.vue'
import LoginModal from './components/LoginModal.vue'
import ReportModal from './components/ReportModal.vue'
import StartRunModal  from './components/StartRunModal.vue'
import LogOnlyModal   from './components/LogOnlyModal.vue'
import DeviceLayout from './components/views/DeviceLayout.vue'
import LoggingDetails from './components/views/LoggingDetails.vue'
import Recipe from './components/views/Recipe.vue'
import Settings from './components/views/Settings.vue'
import Users from './components/views/Users.vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'

const connection       = ref(null)
const connectionStatus = ref('Disconnected')
const activeView       = ref('device-layout')
const logEntries       = ref([])
const generalSettings  = ref({
  host:            'localhost',
  port:            5176,
  reconnectOnLoss: true,
  logLevel:        'Info',
  maxEntries:      1000,
  autoScroll:      true,
  timeoutMs:       5000,
})
const maxLogEntries = computed(() => generalSettings.value.maxEntries)
const isDark              = ref(false)
const logHeight           = ref(160)
const chartPlotInterval   = ref(3)   // seconds between chart data points

const showLogin      = ref(false)
const showReport     = ref(false)
const showStartRun   = ref(false)
const showLogOnly    = ref(false)
const loginError     = ref('')
const loginLoading   = ref(false)

// Run state — owned here so the Start modal can gate the transition
const runState = ref('idle')   // 'idle' | 'running' | 'paused'

// Run info populated on Start confirm; provided to LoggingDetails
const runInfo  = ref(null)     // { startedBy, startedAt, notes, recipeName, status, dbRunId, selectedSensors }

// ── Chart state — lives here so data survives view navigation ──────────────

const CHART_PALETTE = [
  '#007ACC', '#e64a19', '#388e3c', '#7b1fa2',
  '#0097a7', '#f57c00', '#880e4f', '#558b2f',
]
const MAX_CHART_POINTS = 120

function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Sensors chosen in the Log Only modal; empty array means recipe / idle mode
const loggedSensors = computed(() => runInfo.value?.selectedSensors ?? [])

// Persistent chart data — provided to LoggingDetails (read + write)
const chartData = ref({
  labels:   [],
  datasets: [{
    label:           'Sensor Value',
    data:            [],
    borderColor:     '#007ACC',
    backgroundColor: 'rgba(0, 122, 204, 0.08)',
    borderWidth:     2,
    tension:         0.3,
    pointRadius:     2,
    fill:            true,
  }],
})

// Rebuild chart datasets whenever the set of logged sensors changes.
// When sensors go non-empty → empty (run stops), DO NOT clear the chart —
// preserve the live data so users can review it after the recipe finishes.
// Only reset to the default single-line when starting from idle (prevSensors empty).
watch(loggedSensors, (sensors, prevSensors) => {
  if (sensors.length > 0) {
    chartData.value = {
      labels:   [],
      datasets: sensors.map((s, i) => ({
        sensorId:        s.id,
        label:           s.name,
        data:            [],
        borderColor:     CHART_PALETTE[i % CHART_PALETTE.length],
        backgroundColor: chartHexToRgba(CHART_PALETTE[i % CHART_PALETTE.length], 0.08),
        borderWidth:     2,
        tension:         0.3,
        pointRadius:     2,
        fill:            sensors.length === 1,
      })),
    }
  } else if (!prevSensors || prevSensors.length === 0) {
    // Initial render (immediate) or idle→idle: reset to generic single-line default
    chartData.value = {
      labels:   [],
      datasets: [{
        label:           'Sensor Value',
        data:            [],
        borderColor:     '#007ACC',
        backgroundColor: 'rgba(0, 122, 204, 0.08)',
        borderWidth:     2,
        tension:         0.3,
        pointRadius:     2,
        fill:            true,
      }],
    }
  }
  // sensors empty + prevSensors non-empty = run just stopped: leave chart data intact
}, { immediate: true })

// Tracks the last time a chart point was written; reset when the interval changes
// so the new interval takes effect immediately rather than waiting for the old one to expire.
let lastChartPlotMs = 0

// Persist run state across refreshes so the ribbon reflects the correct buttons on reload.
watch(
  [runState, runInfo],
  ([state, info]) => {
    if (state !== 'idle' && info) {
      localStorage.setItem('savi-run', JSON.stringify({ runState: state, runInfo: info }))
    } else {
      localStorage.removeItem('savi-run')
    }
  },
  { deep: true }
)

function syncPollInterval(seconds) {
  fetch(`${BACKEND_URL}/api/settings/poll-interval`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ intervalSeconds: seconds }),
  }).catch(() => {})
}

watch(chartPlotInterval, (seconds) => {
  lastChartPlotMs = 0
  syncPollInterval(seconds)
})

// Auth state — token kept in memory only (not localStorage)
const authToken   = ref(null)
const currentUser = ref(null)  // { username, role }

// Shared canvas items — DeviceLayout (edit) and LoggingDetails (sensor picker) both inject this
const layoutItems = ref([])

// Shared device connections — Settings (edit) and AddSensorModal (picker) both inject this
const devices = ref([
  {
    id: 1, name: 'COM Device', type: 'com', expanded: false,
    properties: [
      { name: 'Device Name', value: '',     description: 'Friendly name for this device',    propType: 'string', editing: false },
      { name: 'ComPort',     value: 'COM1', description: 'COM port (e.g., COM1)',             propType: 'string', editing: false },
      { name: 'BaudRate',    value: '9600', description: 'Baud rate for communication',       propType: 'int',    editing: false },
    ],
  },
  {
    id: 2, name: 'IP Device', type: 'ip', expanded: false,
    properties: [
      { name: 'Device Name', value: '',              description: 'Friendly name for this device', propType: 'string', editing: false },
      { name: 'IpAddress',   value: '192.168.1.100', description: 'IP address of the device',      propType: 'string', editing: false },
      { name: 'PortNumber',  value: '502',            description: 'Port number for connection',    propType: 'int',    editing: false },
    ],
  },
])

const viewMap = {
  'device-layout':   DeviceLayout,
  'logging-details': LoggingDetails,
  'recipe':          Recipe,
  'settings':        Settings,
  'users':           Users,
}

const statusColor = computed(() => {
  if (connectionStatus.value === 'Connected')    return '#4caf50'
  if (connectionStatus.value === 'Disconnected') return '#f44336'
  return '#ff9800'
})

function saveAppSettings() {
  fetch(`${BACKEND_URL}/api/settings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      theme:             isDark.value ? 'dark' : 'light',
      chartPlotInterval: chartPlotInterval.value,
      generalSettings:   generalSettings.value,
    }),
  }).catch(() => {})
}

provide('connection',    connection)
provide('logEntries',    logEntries)
provide('addLog',        addLog)
provide('maxLogEntries',    maxLogEntries)
provide('generalSettings', generalSettings)
provide('devices',       devices)
provide('layoutItems',   layoutItems)
provide('authToken',     authToken)
provide('currentUser',   currentUser)
provide('BACKEND_URL',    BACKEND_URL)
provide('runInfo',        runInfo)
provide('runState',       runState)
provide('chartData',        chartData)      // persistent across view navigation
provide('loggedSensors',   loggedSensors)
provide('chartPlotInterval', chartPlotInterval)
provide('saveAppSettings', saveAppSettings)

function addLog(message, level = 'Info') {
  logEntries.value.push({ timestamp: new Date().toLocaleTimeString(), message, level })
  if (logEntries.value.length > maxLogEntries.value) {
    logEntries.value = logEntries.value.slice(-maxLogEntries.value)
  }
}

async function restoreRunState() {
  const stored = localStorage.getItem('savi-run')
  if (!stored) return
  try {
    const { runState: savedState, runInfo: savedInfo } = JSON.parse(stored)
    const dbRunId = savedInfo?.dbRunId
    if (!dbRunId) { localStorage.removeItem('savi-run'); return }

    const res = await fetch(`${BACKEND_URL}/api/runs/${dbRunId}`)
    if (res.ok) {
      const data = await res.json()
      if (data.status === 'Running') {
        runInfo.value  = savedInfo
        runState.value = savedState
        addLog(`Run #${dbRunId} restored — logging is active`, 'Info')
      } else {
        localStorage.removeItem('savi-run')
      }
    } else {
      localStorage.removeItem('savi-run')
    }
  } catch {
    localStorage.removeItem('savi-run')
  }
}

async function loadTheme() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings`)
    if (!res.ok) return
    const data = await res.json()
    const theme = data?.theme === 'dark' ? 'dark' : 'light'
    localStorage.setItem('savi-theme', theme)
    isDark.value = theme === 'dark'
    document.documentElement.dataset.theme = isDark.value ? 'dark' : ''
    const saved = data?.chartPlotInterval
    if (typeof saved === 'number' && saved >= 1) {
      chartPlotInterval.value = Math.round(saved)
      syncPollInterval(chartPlotInterval.value)
    }
    if (data?.generalSettings) {
      generalSettings.value = { ...generalSettings.value, ...data.generalSettings }
    }
  } catch { /* backend unreachable — honour cached value already applied by index.html */ }
}

async function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.dataset.theme = isDark.value ? 'dark' : ''
  localStorage.setItem('savi-theme', isDark.value ? 'dark' : 'light')
  saveAppSettings()
}

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

async function handleLogin({ username, password }) {
  loginError.value   = ''
  loginLoading.value = true
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })

    if (res.status === 401) {
      loginError.value = 'Invalid username or password, or not authorized for this instance.'
      return
    }
    if (!res.ok) {
      loginError.value = 'Login failed. Please try again.'
      return
    }

    const data = await res.json()
    authToken.value   = data.token
    currentUser.value = { username: data.username, role: data.role }
    showLogin.value   = false
    loginError.value  = ''
    addLog(`Logged in as ${data.username} (${data.role})`, 'Info')
  } catch {
    loginError.value = 'Cannot reach the backend.'
  } finally {
    loginLoading.value = false
  }
}

function handleLogout() {
  authToken.value   = null
  currentUser.value = null
  activeView.value  = 'device-layout'
  addLog('Logged out', 'Info')
}

onMounted(async () => {
  loadTheme()
  await restoreRunState()

  // Load saved device configs so they're available in every view immediately
  try {
    const res = await fetch(`${BACKEND_URL}/api/devices`)
    if (res.ok) {
      const data = await res.json()
      if (data.devices?.length) devices.value = data.devices
    }
  } catch { /* backend not yet reachable — Settings can reload manually */ }

  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BACKEND_URL}/saviHub`)
    .withAutomaticReconnect()
    .build()

  conn.on('ReceiveServerMessage', (msg)          => addLog(msg, 'Info'))
  conn.on('ReceiveMessage',       (sender, msg)  => addLog(`${sender}: ${msg}`, 'Info'))
  conn.on('ReceiveLog',           (ts, msg, lvl) => logEntries.value.push({ timestamp: ts, message: msg, level: lvl }))
  conn.on('RunStateChanged',      (state)        => addLog(`Run state: ${state}`, 'Info'))

  // Real Pi sensor readings — Pi sends SensorUpdate(canvasId_str, value) at poll rate.
  // Updates the canvas tile so Device Layout reflects live state and the
  // SimulatedSensorState chart tick can read the current tile value.
  conn.on('SensorUpdate', (sensorIdStr, value) => {
    const tileId = parseInt(sensorIdStr, 10)
    if (isNaN(tileId)) return
    const tile = layoutItems.value.find(i => i.id === tileId && i.type === 'sensor')
    if (!tile) return
    if (tile.driver === 'collision-detector') {
      tile.value = value >= 0.5 ? 'Collision!' : 'No Contact'
    } else if (tile.driver === 'relay') {
      tile.relayState = value >= 0.5 ? 'on' : 'off'
    }
  })

  // Re-register all real DI sensors with their Pi after a backend restart so
  // live monitoring resumes automatically without user intervention.
  conn.onreconnected(() => {
    for (const item of layoutItems.value) {
      if (item.type !== 'sensor' || item.driver !== 'collision-detector') continue
      if (item.connection === 'Simulated' || item.pin == null) continue
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId === null) continue
      fetch(`${BACKEND_URL}/api/devices/${deviceId}/di/monitor`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin: item.pin, canvasId: item.id }),
      }).catch(() => {})
    }
  })

  // Live simulated sensor state — broadcast every second by SensorSimulationService.
  // 1) Updates relay tiles and collision-detector tiles on the canvas.
  // 2) Pushes chart data points while a log-only session is actively running.
  //    chartData lives here (not in LoggingDetails) so data survives view navigation.
  conn.on('SimulatedSensorState', (state) => {
    // ── Canvas tile updates ─────────────────────────────────────────────────
    for (const r of state.relays ?? []) {
      const item = layoutItems.value.find(
        i => i.type === 'sensor' && i.id === r.id &&
             i.driver === 'relay' && i.connection === 'Simulated'
      )
      if (item) item.relayState = r.state           // 'on' | 'off'
    }
    for (const d of state.digitalInputs ?? []) {
      const item = layoutItems.value.find(
        i => i.type === 'sensor' && i.id === d.id &&
             i.driver === 'collision-detector' && i.connection === 'Simulated'
      )
      if (item) item.value = d.stateLabel           // 'Collision!' | 'No Contact'
    }

    // ── Chart data update (log-only mode, not paused) ───────────────────────
    if (loggedSensors.value.length === 0 || runState.value !== 'running') return

    const nowMs = Date.now()
    if (nowMs - lastChartPlotMs < chartPlotInterval.value * 1000) return
    lastChartPlotMs = nowMs

    const p = n => String(n).padStart(2, '0')
    const now = new Date()
    const label = `${p(now.getDate())}/${p(now.getMonth() + 1)} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`

    const valueMap = new Map()
    for (const r of state.relays       ?? []) valueMap.set(r.id, r.state === 'on' ? 1 : 0)
    for (const d of state.digitalInputs ?? []) valueMap.set(d.id, d.stateLabel === 'Collision!' ? 1 : 0)
    // Real Pi relay/DI sensors aren't in SimulatedSensorState — read their current tile state directly
    for (const s of loggedSensors.value) {
      if (s.connection === 'Simulated') continue
      const tile = layoutItems.value.find(i => i.id === s.id)
      if (!tile) continue
      if (s.driver === 'relay')              valueMap.set(s.id, tile.relayState === 'on' ? 1 : 0)
      if (s.driver === 'collision-detector') valueMap.set(s.id, tile.value === 'Collision!' ? 1 : 0)
    }

    let anyUpdate  = false
    const newDatasets = chartData.value.datasets.map(ds => {
      if (!valueMap.has(ds.sensorId)) return { ...ds }
      anyUpdate = true
      const newData = [...ds.data, valueMap.get(ds.sensorId)]
      if (newData.length > MAX_CHART_POINTS) newData.shift()
      return { ...ds, data: newData }
    })

    if (anyUpdate) {
      const newLabels = [...chartData.value.labels, label]
      if (newLabels.length > MAX_CHART_POINTS) newLabels.shift()
      chartData.value = { labels: newLabels, datasets: newDatasets }

      // Record readings to DB (fire-and-forget)
      const dbRunId = runInfo.value?.dbRunId
      if (dbRunId && authToken.value) {
        const readings = loggedSensors.value
          .filter(s => valueMap.has(s.id))
          .map(s => ({ canvasId: s.id, value: valueMap.get(s.id) }))
        if (readings.length > 0) {
          fetch(`${BACKEND_URL}/api/run/${dbRunId}/readings`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken.value}` },
            body:    JSON.stringify({ readings }),
          }).catch(() => {})
        }
      }
    }
  })

  conn.onreconnecting(() => { connectionStatus.value = 'Reconnecting...' })
  conn.onreconnected(()  => { connectionStatus.value = 'Connected' })
  conn.onclose(()        => { connectionStatus.value = 'Disconnected' })

  try {
    await conn.start()
    connectionStatus.value = 'Connected'
    connection.value       = conn
    addLog('SignalR connected', 'Info')
  } catch (err) {
    connectionStatus.value = 'Disconnected'
    addLog(`Connection error: ${err.message}`, 'Error')
  }
})

onUnmounted(() => connection.value?.stop())

// ── Recipe execution helpers ───────────────────────────────────────────────

function pushChartPoint(sensorId, value) {
  const datasets = chartData.value.datasets
  const idx = datasets.findIndex(ds => ds.sensorId === sensorId)
  if (idx === -1) return

  const p = n => String(n).padStart(2, '0')
  const now = new Date()
  const label = `${p(now.getDate())}/${p(now.getMonth() + 1)} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`

  const newData = [...datasets[idx].data, value]
  if (newData.length > MAX_CHART_POINTS) newData.shift()
  const newDatasets = datasets.map((ds, i) => i === idx ? { ...ds, data: newData } : { ...ds })
  const newLabels = [...chartData.value.labels, label]
  if (newLabels.length > MAX_CHART_POINTS) newLabels.shift()
  chartData.value = { labels: newLabels, datasets: newDatasets }

  const dbRunId = runInfo.value?.dbRunId
  if (dbRunId && authToken.value) {
    fetch(`${BACKEND_URL}/api/run/${dbRunId}/readings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken.value}` },
      body:    JSON.stringify({ readings: [{ canvasId: sensorId, value }] }),
    }).catch(() => {})
  }
}

function resolveDeviceId(ip) {
  for (const d of devices.value) {
    if (d.type === 'ip') {
      const dip = d.properties.find(p => p.name === 'IpAddress')?.value?.trim()
      if (dip === ip) return d.id
    }
  }
  return null
}

async function callRelay(sensor, state) {
  if (!sensor) return
  try {
    if (sensor.connection === 'Simulated') {
      await fetch(`${BACKEND_URL}/api/simulate/relay/${sensor.id}/${state ? 'on' : 'off'}`, {
        method:  'POST',
        headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      })
    } else {
      const deviceId = resolveDeviceId(sensor.connection)
      if (deviceId !== null && sensor.pin != null) {
        await fetch(`${BACKEND_URL}/api/devices/${deviceId}/do`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pin: sensor.pin, state }),
        })
      }
    }
  } catch (err) {
    addLog(`Relay command failed: ${err.message}`, 'Warning')
  }
  // Mirror tile state locally and push a chart point immediately.
  // Real Pi relays have no SimulatedSensorState broadcast, so this is the only chart update path.
  const tile = layoutItems.value.find(i => i.id === sensor.id)
  if (tile) tile.relayState = state ? 'on' : 'off'
  pushChartPoint(sensor.id, state ? 1 : 0)
}

async function executeRecipe(recipe, doSensor, diSensor) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  addLog(`Executing recipe: ${recipe.name} (${recipe.steps.length} steps)`, 'Info')
  for (const step of recipe.steps) {
    if (runState.value !== 'running') break
    if (step.action === 'relay/on')  await callRelay(doSensor, true)
    if (step.action === 'relay/off') await callRelay(doSensor, false)
    // 'wait' and 'di/read' — DI state is live via SignalR, just observe the delay
    await delay(step.durationMs)
  }
  // Ensure relay is off at end of recipe
  if (doSensor) await callRelay(doSensor, false)
  if (runState.value === 'running') {
    addLog(`Recipe complete — stopping run`, 'Info')
    handleRunCommand('stop')
  }
}

async function handleRunCommand(cmd) {
  // 'start' shows the info modal first — don't transition until confirmed
  if (cmd === 'start') {
    showStartRun.value = true
    return
  }

  // 'log-only' — show sensor-picker modal first, same as 'start' shows StartRunModal
  if (cmd === 'log-only') {
    showLogOnly.value = true
    return
  }

  // All other transitions happen immediately
  if (cmd === 'pause')  runState.value = 'paused'
  if (cmd === 'resume') runState.value = 'running'
  if (cmd === 'stop') {
    const dbRunId = runInfo.value?.dbRunId
    runState.value = 'idle'
    if (runInfo.value) runInfo.value = { ...runInfo.value, status: 'Stopped', selectedSensors: [] }
    if (dbRunId) {
      fetch(`${BACKEND_URL}/api/run/${dbRunId}/stop`, {
        method:  'POST',
        headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      }).catch(() => {})
    }
  }
}

async function handleStartConfirmed(info) {
  // Build the sensor list for logging (DO + DI, whichever are present)
  const recipeSensors = [info.doSensor, info.diSensor].filter(Boolean)

  // Ensure every recipe sensor has a canvasId→dbSensorId mapping in the backend
  // before readings start being written.  The DeviceLayout registers sensors on mount,
  // but if it was never visited this session (or the backend restarted), the in-memory
  // mapping is missing and batch reads are silently dropped.
  for (const s of recipeSensors) {
    const endpoint = s.connection === 'Simulated'
      ? `${BACKEND_URL}/api/simulate/register`
      : `${BACKEND_URL}/api/sensors/register-canvas`
    await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ canvasId: s.id, name: s.name, driver: s.driver }),
    }).catch(() => {})
  }

  runState.value = 'running'
  runInfo.value  = {
    startedBy:       info.startedBy,
    startedAt:       new Date().toLocaleTimeString(),
    notes:           info.notes,
    recipeName:      info.recipeName,
    status:          'Running',
    dbRunId:         null,
    selectedSensors: recipeSensors,
    doSensorId:      info.doSensor?.id ?? null,
  }
  showStartRun.value = false

  const sensorNames = recipeSensors.map(s => s.name).join(', ') || 'none'
  addLog(`Run started by ${info.startedBy} — Recipe: ${info.recipeName} — Sensors: ${sensorNames}`, 'Info')

  // Create DB run record
  let recipe = null
  try {
    const res = await fetch(`${BACKEND_URL}/api/run/start`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {}),
      },
      body: JSON.stringify({
        recipeName: info.recipeName,
        startedBy:  info.startedBy,
        notes:      info.notes,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      runInfo.value = { ...runInfo.value, dbRunId: parseInt(data.runId) }
      recipe = data.recipe ?? null
    }
  } catch { /* best-effort — frontend run state already set */ }

  // Execute recipe steps (fire-and-forget — runs asynchronously while UI is live)
  if (recipe?.steps?.length) {
    executeRecipe(recipe, info.doSensor, info.diSensor)
  }
}

async function handleLogOnlyConfirmed(info) {
  runState.value = 'running'
  runInfo.value  = {
    startedBy:       info.startedBy,
    startedAt:       new Date().toLocaleTimeString(),
    notes:           info.notes,
    recipeName:      null,
    status:          'Logging (No Recipe)',
    selectedSensors: info.selectedSensors,   // [{ id, name, driver, connection, unit }]
    dbRunId:         null,
  }
  showLogOnly.value = false
  addLog(
    `Log-only started by ${info.startedBy} — ${info.selectedSensors.length} sensor(s): ` +
    info.selectedSensors.map(s => s.name).join(', '),
    'Info'
  )

  // Create DB run record
  try {
    const res = await fetch(`${BACKEND_URL}/api/run/start`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {}),
      },
      body: JSON.stringify({
        recipeName: 'Log Only',
        startedBy:  info.startedBy,
        notes:      info.notes,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      runInfo.value = { ...runInfo.value, dbRunId: parseInt(data.runId) }
    }
  } catch { /* best-effort */ }
}

function handleOtherCommand(cmd) {
  if (cmd === 'login')           showLogin.value = true
  if (cmd === 'logout')          handleLogout()
  if (cmd === 'generate-report') showReport.value = true
}

function handleNavigate(view) {
  if (view === 'users' && currentUser.value?.role !== 'Admin') return
  if ((view === 'settings' || view === 'logging-details') && !currentUser.value) return
  activeView.value = view
}

// Splitter drag
function onSplitterMouseDown(e) {
  e.preventDefault()
  const startY      = e.clientY
  const startHeight = logHeight.value

  function onMove(ev) {
    const delta = startY - ev.clientY
    logHeight.value = Math.max(60, Math.min(500, startHeight + delta))
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="app-shell">
    <AppRibbon
      :active-view="activeView"
      :connection-status="connectionStatus"
      :status-color="statusColor"
      :is-dark="isDark"
      :current-user="currentUser"
      :run-state="runState"
      @navigate="handleNavigate"
      @run-command="handleRunCommand"
      @other-command="handleOtherCommand"
      @toggle-theme="toggleTheme"
    />

    <div class="main-area">
      <LoggingDetails v-show="activeView === 'logging-details'" />
      <component :is="viewMap[activeView]" v-if="activeView !== 'logging-details'" />
    </div>

    <div class="h-splitter" @mousedown="onSplitterMouseDown" />

    <div class="log-area" :style="{ height: logHeight + 'px' }">
      <LogView :entries="logEntries" :auto-scroll="generalSettings.autoScroll" />
    </div>

    <LoginModal
      v-if="showLogin"
      :error="loginError"
      :loading="loginLoading"
      @close="showLogin = false"
      @login="handleLogin"
    />
    <ReportModal
      v-if="showReport"
      @close="showReport = false"
    />
    <StartRunModal
      v-if="showStartRun"
      @confirm="handleStartConfirmed"
      @cancel="showStartRun = false"
    />
    <LogOnlyModal
      v-if="showLogOnly"
      @confirm="handleLogOnlyConfirmed"
      @cancel="showLogOnly = false"
    />
  </div>
</template>
