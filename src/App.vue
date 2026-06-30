<script setup>
import { ref, inject, provide, computed, watch, onMounted, onUnmounted } from 'vue'
import * as signalR from '@microsoft/signalr'
import AppRibbon from './components/AppRibbon.vue'
import LogPanel from './components/LogPanel.vue'
import LoginDialog    from './components/LoginDialog.vue'
import ReportDialog   from './components/ReportDialog.vue'
import StartRunDialog from './components/StartRunDialog.vue'
import LogOnlyDialog  from './components/LogOnlyDialog.vue'
import DeviceLayout from './components/views/DeviceLayout.vue'
import LoggingDetails from './components/views/LoggingDetails.vue'
import Recipe from './components/views/Recipe.vue'
import Settings from './components/views/Settings.vue'
import Users from './components/views/Users.vue'
import { LOG_LEVELS } from './constants/logLevels.js'
import { PERMISSIONS, canAccess } from './auth/roles.js'
import { RUN_COMMANDS, OTHER_COMMANDS } from './constants/commands.js'
import { DRIVERS, DEVICE_TYPES, DEVICE_PROPS } from './constants/devices.js'

const BACKEND_URL = inject('BACKEND_URL')

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

const showLoginDialog      = ref(false)
const showReportDialog     = ref(false)
const showStartRunDialog   = ref(false)
const showLogOnlyDialog    = ref(false)
const loginError     = ref('')
const loginLoading   = ref(false)

// Run state — owned here so the Start dialog can gate the transition
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

// Sensors chosen in the Log Only dialog; empty array means recipe / idle mode
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
  }).catch(e => addLog(`Failed to sync poll interval: ${e.message}`, LOG_LEVELS.Warning))
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

// Shared device connections — Settings (edit) and AddSensorDialog (picker) both inject this
const devices = ref([
  {
    id: 1, name: 'COM Device', type: DEVICE_TYPES.Com, expanded: false,
    properties: [
      { name: DEVICE_PROPS.DeviceName, value: '',     description: 'Friendly name for this device',    propType: 'string', editing: false },
      { name: DEVICE_PROPS.ComPort,    value: 'COM1', description: 'COM port (e.g., COM1)',             propType: 'string', editing: false },
      { name: DEVICE_PROPS.BaudRate,   value: '9600', description: 'Baud rate for communication',       propType: 'int',    editing: false },
    ],
  },
  {
    id: 2, name: 'IP Device', type: DEVICE_TYPES.Ip, expanded: false,
    properties: [
      { name: DEVICE_PROPS.DeviceName, value: '',              description: 'Friendly name for this device', propType: 'string', editing: false },
      { name: DEVICE_PROPS.IpAddress,  value: '192.168.1.100', description: 'IP address of the device',      propType: 'string', editing: false },
      { name: DEVICE_PROPS.PortNumber, value: '502',            description: 'Port number for connection',    propType: 'int',    editing: false },
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
  }).catch(e => addLog(`Failed to save app settings: ${e.message}`, LOG_LEVELS.Warning))
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
provide('runInfo',        runInfo)
provide('runState',       runState)
provide('chartData',        chartData)      // persistent across view navigation
provide('loggedSensors',   loggedSensors)
provide('chartPlotInterval', chartPlotInterval)
provide('saveAppSettings', saveAppSettings)

const LEVEL_NAMES = ['Info', 'Warning', 'Error']
function addLog(message, level = LOG_LEVELS.Info) {
  const levelName = LEVEL_NAMES[level] ?? 'Info'
  logEntries.value.push({ timestamp: new Date().toLocaleTimeString(), message, level: levelName })
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

    const response = await fetch(`${BACKEND_URL}/api/runs/${dbRunId}`)
    if (response.ok) {
      const data = await response.json()
      if (data.status === 'Running') {
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

async function loadTheme() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/settings`)
    if (!response.ok) {
      addLog(`Failed to load settings (HTTP ${response.status})`, LOG_LEVELS.Warning)
      return
    }
    const data = await response.json()
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
  } catch (e) {
    addLog(`Backend unreachable — using cached theme: ${e.message}`, LOG_LEVELS.Warning)
  }
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
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })

    if (response.status === 401) {
      loginError.value = 'Invalid username or password, or not authorized for this instance.'
      return
    }
    if (!response.ok) {
      loginError.value = 'Login failed. Please try again.'
      addLog(`Login failed (HTTP ${response.status})`, LOG_LEVELS.Warning)
      return
    }

    const data = await response.json()
    authToken.value   = data.token
    currentUser.value = { username: data.username, role: data.role }
    showLoginDialog.value   = false
    loginError.value  = ''
    addLog(`Logged in as ${data.username} (${data.role})`, LOG_LEVELS.Info)
  } catch (e) {
    loginError.value = 'Cannot reach the backend.'
    addLog(`Login request failed: ${e.message}`, LOG_LEVELS.Error)
  } finally {
    loginLoading.value = false
  }
}

function handleLogout() {
  authToken.value   = null
  currentUser.value = null
  activeView.value  = 'device-layout'
  addLog('Logged out', LOG_LEVELS.Info)
}

onMounted(async () => {
  loadTheme()
  await restoreRunState()

  // Load saved device configs so they're available in every view immediately
  try {
    const response = await fetch(`${BACKEND_URL}/api/devices`)
    if (response.ok) {
      const data = await response.json()
      if (data.devices?.length) devices.value = data.devices
    } else {
      addLog(`Failed to load devices (HTTP ${response.status})`, LOG_LEVELS.Warning)
    }
  } catch (e) {
    addLog(`Failed to load devices: ${e.message}`, LOG_LEVELS.Warning)
  }

  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BACKEND_URL}/saviHub`)
    .withAutomaticReconnect()
    .build()

  conn.on('ReceiveServerMessage', (msg)          => addLog(msg, LOG_LEVELS.Info))
  conn.on('ReceiveMessage',       (sender, msg)  => addLog(`${sender}: ${msg}`, LOG_LEVELS.Info))
  conn.on('ReceiveLog',           (ts, msg, lvl) => logEntries.value.push({ timestamp: ts, message: msg, level: lvl }))
  conn.on('RunStateChanged',      (state)        => addLog(`Run state: ${state}`, LOG_LEVELS.Info))

  // Real Pi sensor readings — Pi sends SensorUpdate(canvasId_str, value) at poll rate.
  // Updates the canvas tile so Device Layout reflects live state and the
  // SimulatedSensorState chart tick can read the current tile value.
  conn.on('SensorUpdate', (sensorIdStr, value) => {
    const tileId = parseInt(sensorIdStr, 10)
    if (isNaN(tileId)) return
    const tile = layoutItems.value.find(i => i.id === tileId && i.type === 'sensor')
    if (!tile) return
    if (tile.driver === DRIVERS.CollisionDetector) {
      tile.value = value >= 0.5 ? 'Collision!' : 'No Contact'
    } else if (tile.driver === DRIVERS.Relay) {
      tile.relayState = value >= 0.5 ? 'on' : 'off'
    }
  })

  // Re-register all real DI sensors with their Pi after a backend restart so
  // live monitoring resumes automatically without user intervention.
  conn.onreconnected(() => {
    for (const item of layoutItems.value) {
      if (item.type !== 'sensor' || item.driver !== DRIVERS.CollisionDetector) continue
      if (item.connection === DRIVERS.Simulated || item.pin == null) continue
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId === null) continue
      fetch(`${BACKEND_URL}/api/devices/${deviceId}/di/monitor`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin: item.pin, canvasId: item.id }),
      }).catch(e => addLog(`DI monitor re-setup failed after reconnect: ${e.message}`, LOG_LEVELS.Warning))
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
             i.driver === DRIVERS.Relay && i.connection === DRIVERS.Simulated
      )
      if (item) item.relayState = r.state           // 'on' | 'off'
    }
    for (const d of state.digitalInputs ?? []) {
      const item = layoutItems.value.find(
        i => i.type === 'sensor' && i.id === d.id &&
             i.driver === DRIVERS.CollisionDetector && i.connection === DRIVERS.Simulated
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
      if (s.connection === DRIVERS.Simulated) continue
      const tile = layoutItems.value.find(i => i.id === s.id)
      if (!tile) continue
      if (s.driver === DRIVERS.Relay)             valueMap.set(s.id, tile.relayState === 'on' ? 1 : 0)
      if (s.driver === DRIVERS.CollisionDetector) valueMap.set(s.id, tile.value === 'Collision!' ? 1 : 0)
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
          }).catch(e => addLog(`Failed to write readings to DB: ${e.message}`, LOG_LEVELS.Warning))
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
    addLog('SignalR connected', LOG_LEVELS.Info)
  } catch (e) {
    connectionStatus.value = 'Disconnected'
    addLog(`Connection error: ${e.message}`, LOG_LEVELS.Error)
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
    }).catch(e => addLog(`Failed to write reading to DB: ${e.message}`, LOG_LEVELS.Warning))
  }
}

function resolveDeviceId(ip) {
  for (const d of devices.value) {
    if (d.type === DEVICE_TYPES.Ip) {
      const dip = d.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()
      if (dip === ip) return d.id
    }
  }
  return null
}

async function callRelay(sensor, state) {
  if (!sensor) return
  try {
    if (sensor.connection === DRIVERS.Simulated) {
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
          body:    JSON.stringify({ pin: sensor.pin, state, canvasId: sensor.id }),
        })
      }
    }
  } catch (e) {
    addLog(`Relay command failed: ${e.message}`, LOG_LEVELS.Warning)
  }
  // Mirror tile state locally and push a chart point immediately.
  // Real Pi relays have no SimulatedSensorState broadcast, so this is the only chart update path.
  const tile = layoutItems.value.find(i => i.id === sensor.id)
  if (tile) tile.relayState = state ? 'on' : 'off'
  pushChartPoint(sensor.id, state ? 1 : 0)
}

async function executeRecipe(recipe, doSensor, diSensor) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  addLog(`Executing recipe: ${recipe.name} (${recipe.steps.length} steps)`, LOG_LEVELS.Info)
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
    addLog(`Recipe complete — stopping run`, LOG_LEVELS.Info)
    handleRunCommand(RUN_COMMANDS.Stop)
  }
}

async function handleRunCommand(cmd) {
  if (cmd === RUN_COMMANDS.Start) {
    showStartRunDialog.value = true
    return
  }

  if (cmd === RUN_COMMANDS.LogOnly) {
    showLogOnlyDialog.value = true
    return
  }

  if (cmd === RUN_COMMANDS.Pause)  runState.value = 'paused'
  if (cmd === RUN_COMMANDS.Resume) runState.value = 'running'
  if (cmd === RUN_COMMANDS.Stop) {
    const dbRunId = runInfo.value?.dbRunId
    runState.value = 'idle'
    if (runInfo.value) runInfo.value = { ...runInfo.value, status: 'Stopped', selectedSensors: [] }
    if (dbRunId) {
      fetch(`${BACKEND_URL}/api/run/${dbRunId}/stop`, {
        method:  'POST',
        headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      }).catch(e => addLog(`Failed to send run stop to backend: ${e.message}`, LOG_LEVELS.Warning))
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
    const endpoint = s.connection === DRIVERS.Simulated
      ? `${BACKEND_URL}/api/simulate/register`
      : `${BACKEND_URL}/api/sensors/register-canvas`
    await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ canvasId: s.id, name: s.name, driver: s.driver }),
    }).catch(e => addLog(`Sensor pre-registration failed: ${e.message}`, LOG_LEVELS.Warning))
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
  showStartRunDialog.value = false

  const sensorNames = recipeSensors.map(s => s.name).join(', ') || 'none'
  addLog(`Run started by ${info.startedBy} — Recipe: ${info.recipeName} — Sensors: ${sensorNames}`, LOG_LEVELS.Info)

  // Create DB run record
  let recipe = null
  try {
    const response = await fetch(`${BACKEND_URL}/api/run/start`, {
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
  showLogOnlyDialog.value = false
  addLog(
    `Log-only started by ${info.startedBy} — ${info.selectedSensors.length} sensor(s): ` +
    info.selectedSensors.map(s => s.name).join(', '),
    LOG_LEVELS.Info
  )

  // Create DB run record
  try {
    const response = await fetch(`${BACKEND_URL}/api/run/start`, {
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

function handleOtherCommand(cmd) {
  if (cmd === OTHER_COMMANDS.Login)          showLoginDialog.value = true
  if (cmd === OTHER_COMMANDS.Logout)         handleLogout()
  if (cmd === OTHER_COMMANDS.GenerateReport) showReportDialog.value = true
}

function handleNavigate(view) {
  if (view === 'users' && !canAccess(currentUser.value, PERMISSIONS.AdminOnly)) return
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
      <div v-if="!currentUser" class="login-required">
        Please login to use the application.
      </div>
      <template v-else>
        <LoggingDetails v-show="activeView === 'logging-details'" />
        <component :is="viewMap[activeView]" v-if="activeView !== 'logging-details'" />
      </template>
    </div>

    <div class="h-splitter" @mousedown="onSplitterMouseDown" />

    <div class="log-area" :style="{ height: logHeight + 'px' }">
      <LogPanel :entries="logEntries" :auto-scroll="generalSettings.autoScroll" />
    </div>

    <LoginDialog
      v-if="showLoginDialog"
      :error="loginError"
      :loading="loginLoading"
      @close="showLoginDialog = false"
      @login="handleLogin"
    />
    <ReportDialog
      v-if="showReportDialog"
      @close="showReportDialog = false"
    />
    <StartRunDialog
      v-if="showStartRunDialog"
      @confirm="handleStartConfirmed"
      @cancel="showStartRunDialog = false"
    />
    <LogOnlyDialog
      v-if="showLogOnlyDialog"
      @confirm="handleLogOnlyConfirmed"
      @cancel="showLogOnlyDialog = false"
    />
  </div>
</template>

<style scoped>
/*
 * ==========================================
 * App shell layout
 * ==========================================
 */

/* Outer flex column that stacks the ribbon, main view, splitter, and log panel
   top to bottom and locks the whole thing to the viewport height. */
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-body);
  color: var(--text-primary);
}

/* Flexible region between the ribbon and the log panel — fills all remaining height. */
.main-area {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  background: var(--bg-panel);
}

/* Centered message shown when the user needs to log in before viewing a page. */
.login-required {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 16px;
  color: var(--text-secondary);
}

/* Thin draggable bar between the main area and the log panel.
   The cursor changes to a vertical resize arrow on hover. */
.h-splitter {
  height: 5px;
  background: var(--bg-splitter);
  cursor: ns-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.h-splitter:hover { background: var(--accent); }

/* Container for the scrollable log panel at the bottom of the screen. */
.log-area {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-log);
}
</style>
