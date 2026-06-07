<script setup>
import { ref, provide, computed, onMounted, onUnmounted } from 'vue'
import * as signalR from '@microsoft/signalr'
import AppRibbon from './components/AppRibbon.vue'
import LogView from './components/LogView.vue'
import LoginModal from './components/LoginModal.vue'
import ReportModal from './components/ReportModal.vue'
import DeviceLayout from './components/views/DeviceLayout.vue'
import LoggingDetails from './components/views/LoggingDetails.vue'
import Settings from './components/views/Settings.vue'
import Users from './components/views/Users.vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'

const connection       = ref(null)
const connectionStatus = ref('Disconnected')
const activeView       = ref('device-layout')
const logEntries       = ref([])
const maxLogEntries    = ref(1000)
const isDark           = ref(false)
const logHeight        = ref(160)

const showLogin    = ref(false)
const showReport   = ref(false)
const loginError   = ref('')
const loginLoading = ref(false)

// Auth state — token kept in memory only (not localStorage)
const authToken   = ref(null)
const currentUser = ref(null)  // { username, role }

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
  'settings':        Settings,
  'users':           Users,
}

const statusColor = computed(() => {
  if (connectionStatus.value === 'Connected')    return '#4caf50'
  if (connectionStatus.value === 'Disconnected') return '#f44336'
  return '#ff9800'
})

provide('connection',    connection)
provide('logEntries',    logEntries)
provide('addLog',        addLog)
provide('maxLogEntries', maxLogEntries)
provide('devices',       devices)
provide('authToken',     authToken)
provide('currentUser',   currentUser)
provide('BACKEND_URL',   BACKEND_URL)

function addLog(message, level = 'Info') {
  logEntries.value.push({ timestamp: new Date().toLocaleTimeString(), message, level })
  if (logEntries.value.length > maxLogEntries.value) {
    logEntries.value = logEntries.value.slice(-maxLogEntries.value)
  }
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.dataset.theme = isDark.value ? 'dark' : ''
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
    loginError.value = 'Cannot reach the backend. Is the server running?'
  } finally {
    loginLoading.value = false
  }
}

function handleLogout() {
  authToken.value   = null
  currentUser.value = null
  showLogin.value   = true
  addLog('Logged out', 'Info')
}

onMounted(async () => {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BACKEND_URL}/saviHub`)
    .withAutomaticReconnect()
    .build()

  conn.on('ReceiveServerMessage', (msg)          => addLog(msg, 'Info'))
  conn.on('ReceiveMessage',       (sender, msg)  => addLog(`${sender}: ${msg}`, 'Info'))
  conn.on('ReceiveLog',           (ts, msg, lvl) => logEntries.value.push({ timestamp: ts, message: msg, level: lvl }))
  conn.on('RunStateChanged',      (state)        => addLog(`Run state: ${state}`, 'Info'))

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

async function handleRunCommand(cmd) {
  if (connection.value?.state === signalR.HubConnectionState.Connected) {
    try {
      await connection.value.invoke('RunCommand', cmd)
    } catch (err) {
      addLog(`RunCommand '${cmd}' error: ${err.message}`, 'Error')
    }
  } else {
    addLog(`Cannot send '${cmd}': not connected`, 'Warning')
  }
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
      @navigate="handleNavigate"
      @run-command="handleRunCommand"
      @other-command="handleOtherCommand"
      @toggle-theme="toggleTheme"
    />

    <div class="main-area">
      <component :is="viewMap[activeView]" />
    </div>

    <div class="h-splitter" @mousedown="onSplitterMouseDown" />

    <div class="log-area" :style="{ height: logHeight + 'px' }">
      <LogView :entries="logEntries" />
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
  </div>
</template>
