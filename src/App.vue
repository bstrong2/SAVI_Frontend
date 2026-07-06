<script setup>
  import { ref, inject, provide, computed, watch, onMounted, onUnmounted } from 'vue'
  import * as signalR from '@microsoft/signalr'
  import AppRibbon from './components/AppRibbon.vue'
  import LogPanel from './components/LogPanel.vue'
  import LoginDialog from './components/LoginDialog.vue'
  import ReportDialog from './components/ReportDialog.vue'
  import DeviceLayout from './components/views/DeviceLayout.vue'
  import LoggingDetails from './components/views/LoggingDetails.vue'
  import Recipe from './components/views/Recipe.vue'
  import Settings from './components/views/Settings.vue'
  import Users from './components/views/Users.vue'
  import { LOG_LEVELS, RUN_COMMANDS, OTHER_COMMANDS, RUN_STATUS, CONNECTION_STATUS, VIEWS } from './constants/enums.js'
  import { PERMISSIONS, canAccess } from './auth/roles.js'
  import { DEVICE_TYPES, DEVICE_PROPS } from './constants/devices.js'
  import { COLORS } from './constants/colors.js'


  /////////////////////////////////////////////
  // Define variables. Most of the variabels
  // Here are for when other vue files need
  // the data so we inject them.
  const BACKEND_URL = inject('BACKEND_URL')
  const connection = ref(null)
  const connectionStatus = ref(CONNECTION_STATUS.Disconnected)
  const activeView = ref(VIEWS.DeviceLayout)
  const logEntries = ref([])
  const generalSettings = ref({})
  const isDark = ref(false)
  const logHeight = ref(160)
  const chartPlotInterval = ref(3)
  const showLoginDialog = ref(false)
  const showReportDialog = ref(false)
  const showStartRunDialog = ref(false)
  const showLogOnlyDialog = ref(false)
  const runState = ref(RUN_STATUS.Idle)
  const runInfo = ref(null)
  const authToken = ref(null)
  const currentUser = ref(null)
  const layoutItems = ref([])
  const devices = ref([])
  const viewMap = {
    [VIEWS.DeviceLayout]: DeviceLayout,
    [VIEWS.LoggingDetails]: LoggingDetails,
    [VIEWS.Recipe]: Recipe,
    [VIEWS.Settings]: Settings,
    [VIEWS.Users]: Users,
  }

  const LEVEL_NAMES = ['Info', 'Warning', 'Error']


  /////////////////////////////////////////////
  // Define computed properties.
  // Sensors chosen in the Log Only dialog; empty array means recipe / idle mode
  const loggedSensors = computed(() => runInfo.value?.selectedSensors ?? [])
  const maxLogEntries = computed(() => generalSettings.value.maxEntries)

  // Only have the pause button show when we are running logging, not a recipe.
  const isLogOnly = computed(() => !runInfo.value?.recipeName)

  const statusColor = computed(() => {
    if (connectionStatus.value === CONNECTION_STATUS.Connected)    
      return COLORS.green

    if (connectionStatus.value === CONNECTION_STATUS.Disconnected)
      return COLORS.red
    
    return COLORS.orange
  })


  /////////////////////////////////////////////
  // Watch for changes.
  watch(chartPlotInterval, (seconds) => {
    syncPollInterval(seconds)
  })


  /////////////////////////////////////////////
  // Defining all functions.
  function syncPollInterval(seconds) {
    fetch(`${BACKEND_URL}/api/settings/poll-interval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:JSON.stringify({ intervalSeconds: seconds }),
    }).catch(e => addLog(`Failed to sync poll interval: ${e.message}`, LOG_LEVELS.Warning))
  }

  function saveAppSettings() {
    fetch(`${BACKEND_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: isDark.value ? 'dark' : 'light',
        chartPlotInterval: chartPlotInterval.value,
        generalSettings: generalSettings.value,
      }),
    }).catch(e => addLog(`Failed to save app settings: ${e.message}`, LOG_LEVELS.Warning))
  }

  function addLog(message, level = LOG_LEVELS.Info) {
    const levelName = LEVEL_NAMES[level] ?? 'Info'

    logEntries.value.push({ timestamp: new Date().toLocaleTimeString(), message, level: levelName })
    if (logEntries.value.length > maxLogEntries.value) {
      logEntries.value = logEntries.value.slice(-maxLogEntries.value)
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
      isDark.value = theme === 'dark'
      document.documentElement.dataset.theme = isDark.value ? 'dark' : ''
      const saved = data?.chartPlotInterval

      if (typeof saved === 'number' && saved >= 1) {
        chartPlotInterval.value = Math.round(saved)
        syncPollInterval(chartPlotInterval.value)
      }
      if (data?.generalSettings) {
        generalSettings.value = data.generalSettings
      }
    } catch (e) {
      addLog(`Backend unreachable — using cached theme: ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  async function toggleTheme() {
    isDark.value = !isDark.value
    document.documentElement.dataset.theme = isDark.value ? 'dark' : ''
    saveAppSettings()
  }

  function handleLogout() {
    authToken.value = null
    currentUser.value = null
    activeView.value = VIEWS.DeviceLayout
    addLog('Logged out', LOG_LEVELS.Info)
  }

  /////////////////////////////////////////////
  // Dependecy injection
  provide('connection', connection)
  provide('logEntries', logEntries)
  provide('addLog', addLog)
  provide('maxLogEntries', maxLogEntries)
  provide('generalSettings', generalSettings)
  provide('devices', devices)
  provide('layoutItems', layoutItems)
  provide('authToken', authToken)
  provide('currentUser', currentUser)
  provide('runInfo', runInfo)
  provide('runState', runState)
  provide('loggedSensors', loggedSensors)
  provide('chartPlotInterval', chartPlotInterval)
  provide('saveAppSettings', saveAppSettings)
  provide('showStartRunDialog', showStartRunDialog)
  provide('showLogOnlyDialog', showLogOnlyDialog)
  provide('resolveDeviceId', resolveDeviceId)
  provide('handleRunCommand', handleRunCommand)

  
  /////////////////////////////////////////////
  // Mounts
  onMounted(async () => {
    loadTheme()

    // Load saved device configs so they're available in every view immediately
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices`)

      if (response.ok) {
        const data = await response.json()

        if (data.devices?.length) 
          devices.value = data.devices

      } else {
        addLog(`Failed to load devices (HTTP ${response.status})`, LOG_LEVELS.Warning)
      }
    } catch (e) {
      addLog(`Failed to load devices: ${e.message}`, LOG_LEVELS.Warning)
    }

    const conn = new signalR.HubConnectionBuilder().withUrl(`${BACKEND_URL}/saviHub`).withAutomaticReconnect().build()

    conn.on('ReceiveServerMessage', (msg) => addLog(msg, LOG_LEVELS.Info))
    conn.on('ReceiveLog', (ts, msg, lvl) => logEntries.value.push({ timestamp: ts, message: msg, level: lvl }))
    conn.on('RunStateChanged', (state) => addLog(`Run state: ${state}`, LOG_LEVELS.Info))

    // Backend finished a recipe's steps on its own (e.g. browser was closed mid-run) —
    // the run is already marked Stopped server-side, just reset local UI state to match.
    conn.on('RecipeCompleted', (runId) => {
      if (String(runInfo.value?.dbRunId) !== String(runId))
        return

      runState.value = RUN_STATUS.Idle
      runInfo.value = { ...runInfo.value, status: RUN_STATUS.Stopped, selectedSensors: [] }
    })

    conn.onreconnecting(() => { connectionStatus.value = CONNECTION_STATUS.Reconnecting })
    conn.onreconnected(() => { connectionStatus.value = CONNECTION_STATUS.Connected })
    conn.onclose(() => { connectionStatus.value = CONNECTION_STATUS.Disconnected })

    try {
      await conn.start()
      connectionStatus.value = CONNECTION_STATUS.Connected
      connection.value = conn
      addLog('SignalR connected', LOG_LEVELS.Info)
    } catch (e) {
      connectionStatus.value = CONNECTION_STATUS.Disconnected
      addLog(`Connection error: ${e.message}`, LOG_LEVELS.Error)
    }
  })

  onUnmounted(() => connection.value?.stop())

  function resolveDeviceId(ip) {
    for (const d of devices.value) {
      if (d.type === DEVICE_TYPES.Ip) {
        const dip = d.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()

        if (dip === ip) 
          return d.id
      }
    }
    return null
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

    if (cmd === RUN_COMMANDS.Pause)  
      runState.value = RUN_STATUS.Paused

    if (cmd === RUN_COMMANDS.Resume) 
      runState.value = RUN_STATUS.Running

    if (cmd === RUN_COMMANDS.Stop) {
      const dbRunId = runInfo.value?.dbRunId
      runState.value = RUN_STATUS.Idle

      if (runInfo.value) 
        runInfo.value = { ...runInfo.value, status: RUN_STATUS.Stopped, selectedSensors: [] }


      if (dbRunId) {
        fetch(`${BACKEND_URL}/api/run/${dbRunId}/stop`, {
          method: 'POST',
          headers: authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {},
        }).catch(e => addLog(`Failed to send run stop to backend: ${e.message}`, LOG_LEVELS.Warning))
      }
    }
  }

  function handleOtherCommand(cmd) {

    if (cmd === OTHER_COMMANDS.Login)
      showLoginDialog.value = true

    if (cmd === OTHER_COMMANDS.Logout)
      handleLogout()

    if (cmd === OTHER_COMMANDS.GenerateReport)
      showReportDialog.value = true
  }

  function handleNavigate(view) {

    if (view === VIEWS.Users && !canAccess(currentUser.value, PERMISSIONS.AdminOnly))
      return

    if ((view === VIEWS.Settings || view === VIEWS.LoggingDetails) && !currentUser.value)
      return

    activeView.value = view
  }

  // This is to move the log box. It will always be visible through the whole app, so this is the correct location for it.
  function onSplitterMouseDown(e) {
    e.preventDefault()
    const startY = e.clientY
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
    <AppRibbon :active-view="activeView" :connection-status="connectionStatus" :status-color="statusColor" :is-dark="isDark" :current-user="currentUser"
      :run-state="runState" :is-log-only="isLogOnly" @navigate="handleNavigate" @run-command="handleRunCommand" @other-command="handleOtherCommand" @toggle-theme="toggleTheme"/>

    <div class="main-area">
      <div v-if="!currentUser" class="login-required">
        Please login to use the application.
      </div>

      <!-- If we are logged in then display all  -->
      <template v-else>
        <div v-show="activeView === VIEWS.LoggingDetails" class="main-fill">
          <LoggingDetails />
        </div>
        <component :is="viewMap[activeView]" v-if="activeView !== VIEWS.LoggingDetails" />
      </template>
    </div>

    <!-- The splitter for the log box. -->
    <div class="h-splitter" @mousedown="onSplitterMouseDown" />

    <div class="log-area" :style="{ height: logHeight + 'px' }">
      <LogPanel :entries="logEntries" :auto-scroll="generalSettings.autoScroll" />
    </div>

    <LoginDialog v-if="showLoginDialog" @close="showLoginDialog = false" />

    <ReportDialog v-if="showReportDialog" @close="showReportDialog = false"/>
  </div>
</template>

<style scoped>

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-body);
  color: var(--text-primary);
}

/* Flexible region between the ribbon and the log panel, fills all remaining height. */
.main-area {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  background: var(--bg-panel);
}

.main-fill {
  height: 100%;
  overflow: hidden;
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

/* Thin draggable bar between the main area and the log panel. The cursor changes to a vertical resize arrow on hover. */
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
