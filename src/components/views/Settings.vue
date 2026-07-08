<script setup>
  import { ref, computed, watch, inject, onMounted, onUnmounted, nextTick } from 'vue'
  import { ITEM_TYPES, DRIVERS, DEVICE_TYPES, DEVICE_PROPS } from '../../constants/devices.js'
  import { LOG_LEVELS } from '../../constants/enums.js'


  /////////////////////////////////////////////
  // Define variables.
  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const addLog = inject('addLog')
  const chartPlotInterval = inject('chartPlotInterval', ref(3))
  const saveAppSettings = inject('saveAppSettings', () => {})
  const generalSettings = inject('generalSettings')
  const devices = inject('devices')
  const layoutItems = inject('layoutItems', ref([]))

  const settings = ref([
    { id: 1, depth: 0, name: 'Connection', value: '', description: 'Connection settings', type: 'group', expanded: true },
    { id: 4, depth: 1, name: 'Reconnect on Loss', value: generalSettings.value.reconnectOnLoss, description: 'Auto-reconnect when disconnected', type: 'bool', editing: false },
    { id: 5, depth: 0, name: 'Logging', value: '', description: 'Logging settings', type: 'group',  expanded: true },
    { id: 6, depth: 1, name: 'Log Level', value: generalSettings.value.logLevel, description: 'Minimum log level to display', type: 'string', editing: false },
    { id: 7, depth: 1, name: 'Max Entries', value: generalSettings.value.maxEntries, description: 'Maximum log rows to keep in view', type: 'int', editing: false },
    { id: 8, depth: 1, name: 'Auto Scroll', value: generalSettings.value.autoScroll, description: 'Auto-scroll log to newest entry', type: 'bool', editing: false },
    { id: 9, depth: 0, name: 'Acquisition', value: '', description: 'Data acquisition settings', type: 'group',  expanded: true },
    { id: 11, depth: 1, name: 'Timeout (ms)', value: generalSettings.value.timeoutMs, description: 'Sensor read timeout', type: 'int', editing: false },
  ])

  const dcExpanded = ref(true)
  let nextDevId = Math.max(...devices.value.map(d => d.id), 2) + 1

  const savedSettingsValues = ref(settings.value.map(s => ({ id: s.id, value: s.value })))
  const savedDevicesJson = ref(null)
  const savedPlotInterval = ref(chartPlotInterval.value)
  const context = ref({ 
    visible: false, 
    x: 0, 
    y: 0, 
    mode: null, 
    target: null })


  /////////////////////////////////////////////
  // Define computed properties.
  const contextMenuStyle = computed(() => ({ 
    top: context.value.y + 'px', 
    left: context.value.x + 'px' 
  }))

  const visibleSettings = computed(() => {
    const result = []
    let currentGroupExpanded = true

    for (const s of settings.value) {
      if (s.type === 'group') {
        currentGroupExpanded = s.expanded
        result.push(s)
      } else if (currentGroupExpanded) {
        result.push(s)
      }
    }
    return result
  })

  const plotInterval = computed({
    get: () => chartPlotInterval.value,
    set: (v) => {
      const clamped = Math.max(1, Math.min(3600, Math.round(Number(v))))
      if (!isNaN(clamped)) {
        chartPlotInterval.value = clamped
        saveAppSettings()
      }
    },
  })

  const devicesSnapshot = computed(() =>
    JSON.stringify(devices.value.map(d => ({
      ...d,
      properties: d.properties.map(({ editing, ...rest }) => ({ ...rest, value: String(rest.value) })),
    })))
  )

  const unsavedChanges = computed(() => {
    if (chartPlotInterval.value !== savedPlotInterval.value) 
      return true

    for (const saved of savedSettingsValues.value) {
      const cur = settings.value.find(s => s.id === saved.id)

      if (cur && String(cur.value) !== String(saved.value)) 
        return true
    }
    return devicesSnapshot.value !== savedDevicesJson.value
  })


  /////////////////////////////////////////////
  // Watch for changes.
  watch(settings, (rows) => {
    const g = generalSettings.value
    const v = id => rows.find(s => s.id === id)?.value

    generalSettings.value = {
      host: v(2)  ?? g.host,
      port: Number(v(3))  || g.port,
      reconnectOnLoss: v(4)  ?? g.reconnectOnLoss,
      logLevel: v(6)  ?? g.logLevel,
      maxEntries: Number(v(7))  || g.maxEntries,
      autoScroll: v(8)  ?? g.autoScroll,
      timeoutMs: Number(v(11)) || g.timeoutMs,
    }
  }, { deep: true })


  /////////////////////////////////////////////
  // Mounts
  onMounted(() => {
    window.addEventListener('click', hideContext)
    // Re-baseline after App.vue's async startup fetches have completed
    savedDevicesJson.value = devicesSnapshot.value
    savedPlotInterval.value = chartPlotInterval.value
  })

  onUnmounted(() => window.removeEventListener('click', hideContext))


  /////////////////////////////////////////////
  // Defining all functions.
  function updateSavedSnapshot() {
    savedSettingsValues.value = settings.value.map(s => ({ id: s.id, value: s.value }))
    savedDevicesJson.value = devicesSnapshot.value
    savedPlotInterval.value = chartPlotInterval.value
  }

  function showContext(e, mode, target) {
    e.preventDefault()
    e.stopPropagation()
    context.value = { 
      visible: true, 
      x: e.clientX, 
      y: e.clientY, 
      mode, 
      target 
    }
  }

  function hideContext() { 
    context.value.visible = false 
  }

  function addDevice(type) {
    const id = nextDevId++
    devices.value.push(
      type === DEVICE_TYPES.Com
        ? { id, name: 'COM Device', type: DEVICE_TYPES.Com, expanded: true, properties: [
              { name: DEVICE_PROPS.DeviceName, value: '', description: 'Friendly name for this device', propType: 'string', editing: false },
              { name: DEVICE_PROPS.ComPort, value: '', description: 'COM port (e.g., COM1)', propType: 'string', editing: false },
              { name: DEVICE_PROPS.BaudRate, value: '9600', description: 'Baud rate for communication', propType: 'int', editing: false },
            ] }
        : { id, name: 'IP Device', type: DEVICE_TYPES.Ip, expanded: true, properties: [
              { name: DEVICE_PROPS.DeviceName, value: '', description: 'Friendly name for this device', propType: 'string', editing: false },
              { name: DEVICE_PROPS.IpAddress, value: '',  description: 'IP address of the device', propType: 'string', editing: false },
              { name: DEVICE_PROPS.PortNumber, value: '502', description: 'Port number for connection', propType: 'int', editing: false },
            ] }
    )
    hideContext()
  }

  async function deleteDevice(device) {
    hideContext()

    // Tell the Pi to stop monitoring any DI pins wired to this device before we forget
    // its IP/port — otherwise it keeps polling and broadcasting for pins nobody reads anymore.
    if (device.type === DEVICE_TYPES.Ip) {
      const ip = device.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()
      const monitoredTiles = ip
        ? layoutItems.value.filter(i => i.type === ITEM_TYPES.Sensor && i.driver === DRIVERS.CollisionDetector
            && i.connection === ip && i.pin != null)
        : []

      for (const item of monitoredTiles) {
        try {
          await fetch(`${BACKEND_URL}/api/devices/${device.id}/di/unmonitor?pin=${item.pin}`, {
            method: 'POST',
          })
        } catch (e) {
          addLog?.(`DI unmonitor failed for "${item.name}" before removing device: ${e.message}`, LOG_LEVELS.Warning)
        }
      }
    }

    devices.value = devices.value.filter(d => d.id !== device.id)
  }

  function startDevEdit(prop) {
    devices.value.forEach(d => d.properties.forEach(p => { p.editing = false }))
    prop.editing = true
    nextTick(() => {
      const el = document.querySelector('.dev-prop-editing input')

      if (el) { 
        el.focus(); el.select?.() 
      }
    })
  }

  function stopDevEdit(prop) {
    prop.editing = false 
  }

  function devEditKey(e, prop) {
    if (e.key === 'Enter' || e.key === 'Escape') 
      stopDevEdit(prop)
  }

  function startEdit(s) { 
    if (s.type !== 'group') 
      s.editing = true 
  }

  function stopEdit(s) { 
    s.editing = false 
  }

  function handleKeyDown(e, s) {
    if (e.key === 'Enter' || e.key === 'Escape') 
      stopEdit(s)
  }

  async function saveSettings() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken?.value}`,
        },
        body: JSON.stringify({ devices: devices.value }),
      })
      if (response.ok) {
        saveAppSettings()
        updateSavedSnapshot()
        addLog?.('Settings saved successfully', LOG_LEVELS.Info)
      } else {
        addLog?.(`Settings save failed (${response.status})`, LOG_LEVELS.Warning)
      }
    } catch {
      addLog?.('Settings save failed — backend unreachable', LOG_LEVELS.Error)
    }
  }

  async function loadSettings() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices`)
      
      if (response.ok) {
        const data = await response.json()

        if (data.devices?.length) 
          devices.value = data.devices
      } else {
        addLog?.(`Failed to load settings (HTTP ${response.status})`, LOG_LEVELS.Warning)
      }
    } catch (e) {
      addLog?.(`Failed to load settings: ${e.message}`, LOG_LEVELS.Warning)
    }
    updateSavedSnapshot()
  }
</script>

<template>
  <div class="settings-view" @click="hideContext">
    <div class="view-toolbar">
      <button class="toolbar-btn" @click.stop="saveSettings"><font-awesome-icon icon="floppy-disk" style="color: var(--accent)" /> Save Settings</button>
      <span v-if="unsavedChanges" class="unsaved-indicator"><font-awesome-icon icon="triangle-exclamation" /> Unsaved changes</span>
      <button class="toolbar-btn" @click.stop="loadSettings"><font-awesome-icon icon="folder-open" style="color: var(--color-gold)" /> Load Settings (last saved)</button>
    </div>

    <div class="settings-table">
      <table>
        <thead>
          <tr>
            <th style="width:240px">Name</th>
            <th style="width:200px">Value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <!-- ── General settings rows ── -->
          <tr v-for="s in visibleSettings" :key="s.id" :class="{ 'settings-group-row': s.type === 'group' }"
            :style="s.type === 'group' ? { cursor: 'pointer' } : {}" @click="s.type === 'group' ? s.expanded = !s.expanded : null">
            <td>
              <span class="depth-indent" :style="{ width: s.depth * 20 + 'px' }" />
              <span v-if="s.type === 'group'" class="dc-toggle">{{ s.expanded ? '▾' : '▸' }}</span>
              {{ s.name }}
            </td>
            <td @dblclick="startEdit(s)">
              <template v-if="s.type === 'group'" />
              <template v-else-if="s.type === 'bool'">
                <input type="checkbox" v-model="s.value" />
              </template>
              <template v-else>
                <span v-if="!s.editing" style="cursor:pointer">{{ s.value }}</span>
                <input v-else :type="s.type === 'int' ? 'number' : 'text'" v-model="s.value" @blur="stopEdit(s)"
                  @keydown="handleKeyDown($event, s)" style="width:100%" autofocus/>
              </template>
            </td>
            <td>{{ s.description }}</td>
          </tr>

          <!-- Device Connections section -->
          <!-- Root row -->
          <tr class="settings-group-row dc-root-row" style="cursor:pointer" @click.stop="dcExpanded = !dcExpanded"
            @contextmenu="e => showContext(e, 'category', null)">
            <td colspan="3">
              <span class="dc-toggle">{{ dcExpanded ? '▾' : '▸' }}</span>
              <font-awesome-icon icon="link" style="color: var(--accent)" /> Device Connections
              <span class="dc-hint">right-click to add</span>
            </td>
          </tr>

          <template v-if="dcExpanded">
            <template v-for="device in devices" :key="device.id">
              <!-- Device row -->
              <tr class="dc-device-row" style="cursor:pointer" @click.stop="device.expanded = !device.expanded" @contextmenu="e => showContext(e, 'device', device)">
                <td colspan="3">
                  <span class="depth-indent" style="width:20px" />
                  <span class="dc-toggle">{{ device.expanded ? '▾' : '▸' }}</span>
                  <font-awesome-icon :icon="device.type === DEVICE_TYPES.Com ? 'plug' : 'network-wired'" :class="device.type" />
                  {{ device.name }}
                </td>
              </tr>

              <!-- Property rows -->
              <template v-if="device.expanded">
                <tr v-for="prop in device.properties" :key="prop.name" :class="{ 'dev-prop-editing': prop.editing }">
                  <td>
                    <span class="depth-indent" style="width:40px" />
                    {{ prop.name }}
                  </td>
                  <td @dblclick.stop="startDevEdit(prop)">
                    <span v-if="!prop.editing" style="cursor:text">{{ prop.value }}</span>
                    <input v-else :type="prop.propType === 'int' ? 'number' : 'text'" v-model="prop.value" @blur="stopDevEdit(prop)"
                      @keydown="devEditKey($event, prop)" style="width:100%" autofocus/>
                  </td>
                  <td>{{ prop.description }}</td>
                </tr>
              </template>
            </template>
          </template>

          <!-- Charting section -->
          <tr class="settings-group-row">
            <td colspan="3">
              <span class="dc-toggle">▾</span>
              <font-awesome-icon icon="chart-line" style="color: var(--color-green)" /> Charting
            </td>
          </tr>
          <tr>
            <td>
              <span class="depth-indent" style="width:20px" />
              Plot Interval (s)
            </td>
            <td>
              <input type="number" v-model.number="plotInterval" min="1" max="3600" step="1"style="width:90px"/>
            </td>
            <td>Controls how often sensor data is plotted on the chart and saved to the database (1 s - 3600 s)</td>
          </tr>

        </tbody>
      </table>
    </div>

    <!-- Context menu -->
    <div v-if="context.visible" class="context-menu" :style="contextMenuStyle" @click.stop>
      <template v-if="context.mode === 'category'">
        <button class="context-item" @click="addDevice(DEVICE_TYPES.Com)"><font-awesome-icon icon="plug" class="context-icon" style="color: var(--color-green)" /> Add COM Device</button>
        <button class="context-item" @click="addDevice(DEVICE_TYPES.Ip)"><font-awesome-icon icon="network-wired" class="context-icon" style="color: var(--accent)" /> Add IP Device</button>
      </template>
      <template v-else-if="context.mode === 'device'">
        <button class="context-item context-item-danger" @click="deleteDevice(context.target)"><font-awesome-icon icon="trash" class="context-icon" /> Delete</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
  .unsaved-indicator {
    font-size: 12px;
    color: var(--color-gold);
    font-weight: 600;
    align-self: center;
  }

  .dc-root-row td { 
    font-weight: 700; 
  }
  .dc-device-row  { 
    background: var(--bg-table-alt); 
    font-weight: 600; 
    font-size: 12px; 
  }
  .dc-device-row:hover td { 
    background: var(--bg-table-hover); 
  }

  .dc-toggle { 
    font-size: 10px; 
    color: var(--text-secondary); 
    margin-right: 4px; 
  }
  .dc-hint   {
    font-size: 10px; 
    color: var(--text-secondary); 
    font-weight: 400; 
    margin-left: 8px;
  }

  .settings-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .settings-table {
    flex: 1;
    overflow-y: auto;
  }

  .settings-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .settings-table th {
    background: var(--bg-table-header);
    text-align: left;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
  }
  .settings-table td {
    padding: 4px 10px;
    border-bottom: 1px solid var(--border-color);
    font-size: 12px;
    vertical-align: middle;
  }

  .settings-table tr:nth-child(even) td { 
    background: var(--bg-table-alt); 
  }
  .settings-table tr:hover td { 
    background: var(--bg-table-hover); 
  }

  .settings-table td input[type="text"],
  .settings-table td input[type="number"] {
    padding: 2px 6px;
    font-size: 12px;
    width: 100%;
  }

  .settings-group-row td {
    background: var(--bg-table-header) !important;
    font-weight: 600;
  }

  .depth-indent { display: inline-block; }

  .context-icon { 
    width: 14px; 
    flex-shrink: 0; 
  }

  .com { color: var(--color-green); }
  .ip  { color: var(--accent); }

</style>
