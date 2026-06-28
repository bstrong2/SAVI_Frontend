<script setup>
import { ref, computed, watch, inject, onMounted, onUnmounted, nextTick } from 'vue'
import { DEVICE_TYPES, DEVICE_PROPS } from '../../constants/devices.js'

const BACKEND_URL      = inject('BACKEND_URL')
const authToken         = inject('authToken')
const addLog            = inject('addLog')
const chartPlotInterval = inject('chartPlotInterval', ref(3))
const saveAppSettings   = inject('saveAppSettings', () => {})
const generalSettings   = inject('generalSettings', ref({
  host: 'localhost', port: 5176, reconnectOnLoss: true,
  logLevel: 'Info', maxEntries: 1000, autoScroll: true, timeoutMs: 5000,
}))

const settings = ref([
  { id: 1,  depth: 0, name: 'Connection',        value: '',                                  description: 'Connection settings',              type: 'group',  expanded: true },
  { id: 2,  depth: 1, name: 'Host',              value: generalSettings.value.host,          description: 'Backend host address',             type: 'string', editing: false },
  { id: 3,  depth: 1, name: 'Port',              value: generalSettings.value.port,          description: 'Backend port number',              type: 'int',    editing: false },
  { id: 4,  depth: 1, name: 'Reconnect on Loss', value: generalSettings.value.reconnectOnLoss, description: 'Auto-reconnect when disconnected', type: 'bool',   editing: false },
  { id: 5,  depth: 0, name: 'Logging',           value: '',                                  description: 'Logging settings',                 type: 'group',  expanded: true },
  { id: 6,  depth: 1, name: 'Log Level',         value: generalSettings.value.logLevel,      description: 'Minimum log level to display',     type: 'string', editing: false },
  { id: 7,  depth: 1, name: 'Max Entries',       value: generalSettings.value.maxEntries,    description: 'Maximum log rows to keep in view', type: 'int',    editing: false },
  { id: 8,  depth: 1, name: 'Auto Scroll',       value: generalSettings.value.autoScroll,    description: 'Auto-scroll log to newest entry',  type: 'bool',   editing: false },
  { id: 9,  depth: 0, name: 'Acquisition',       value: '',                                  description: 'Data acquisition settings',        type: 'group',  expanded: true },
  { id: 11, depth: 1, name: 'Timeout (ms)',      value: generalSettings.value.timeoutMs,     description: 'Sensor read timeout',              type: 'int',    editing: false },
])

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

// Sync any changed setting row back into the persistent generalSettings ref in App.vue.
// This keeps values alive across view navigation without requiring a Save click.
watch(settings, (rows) => {
  const g = generalSettings.value
  const v = id => rows.find(s => s.id === id)?.value
  generalSettings.value = {
    host:            v(2)  ?? g.host,
    port:            Number(v(3))  || g.port,
    reconnectOnLoss: v(4)  ?? g.reconnectOnLoss,
    logLevel:        v(6)  ?? g.logLevel,
    maxEntries:      Number(v(7))  || g.maxEntries,
    autoScroll:      v(8)  ?? g.autoScroll,
    timeoutMs:       Number(v(11)) || g.timeoutMs,
  }
}, { deep: true })

// Chart plot interval — writable computed so v-model in the template updates
// the App.vue ref immediately (live effect) and persists via saveAppSettings.
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

// ── Device Connections ─────────────────────────────────────────────────────
const dcExpanded = ref(true)
const devices    = inject('devices')
let nextDevId = Math.max(...devices.value.map(d => d.id), 2) + 1

// Serialize devices without the transient `editing` flag.
// Coerce property values to String so that a backend-returned number (9600)
// and a user-typed string ('9600') compare as equal.
const devicesSnapshot = computed(() =>
  JSON.stringify(devices.value.map(d => ({
    ...d,
    properties: d.properties.map(({ editing, ...rest }) => ({ ...rest, value: String(rest.value) })),
  })))
)

// ── Dirty detection — snapshot-based ──────────────────────────────────────
// Stores what values looked like at last save/load; unsavedChanges is a
// computed so it automatically clears when the user restores a value.
const savedSettingsValues = ref(settings.value.map(s => ({ id: s.id, value: s.value })))
const savedDevicesJson    = ref(devicesSnapshot.value)
const savedPlotInterval   = ref(chartPlotInterval.value)

function updateSavedSnapshot() {
  savedSettingsValues.value = settings.value.map(s => ({ id: s.id, value: s.value }))
  savedDevicesJson.value    = devicesSnapshot.value
  savedPlotInterval.value   = chartPlotInterval.value
}

const unsavedChanges = computed(() => {
  if (chartPlotInterval.value !== savedPlotInterval.value) return true
  for (const saved of savedSettingsValues.value) {
    const cur = settings.value.find(s => s.id === saved.id)
    if (cur && String(cur.value) !== String(saved.value)) return true
  }
  return devicesSnapshot.value !== savedDevicesJson.value
})

// Context menu
const ctx = ref({ visible: false, x: 0, y: 0, mode: null, target: null })

function showCtx(e, mode, target) {
  e.preventDefault()
  e.stopPropagation()
  ctx.value = { visible: true, x: e.clientX, y: e.clientY, mode, target }
}
function hideCtx() { ctx.value.visible = false }

function addDevice(type) {
  const id = nextDevId++
  devices.value.push(
    type === DEVICE_TYPES.Com
      ? { id, name: 'COM Device', type: DEVICE_TYPES.Com, expanded: true, properties: [
            { name: DEVICE_PROPS.DeviceName, value: '',     description: 'Friendly name for this device',  propType: 'string', editing: false },
            { name: DEVICE_PROPS.ComPort,    value: '',     description: 'COM port (e.g., COM1)',           propType: 'string', editing: false },
            { name: DEVICE_PROPS.BaudRate,   value: '9600', description: 'Baud rate for communication',     propType: 'int',    editing: false },
          ] }
      : { id, name: 'IP Device', type: DEVICE_TYPES.Ip, expanded: true, properties: [
            { name: DEVICE_PROPS.DeviceName, value: '',    description: 'Friendly name for this device',   propType: 'string', editing: false },
            { name: DEVICE_PROPS.IpAddress,  value: '',    description: 'IP address of the device',        propType: 'string', editing: false },
            { name: DEVICE_PROPS.PortNumber, value: '502', description: 'Port number for connection',      propType: 'int',    editing: false },
          ] }
  )
  hideCtx()
}

function deleteDevice(device) {
  devices.value = devices.value.filter(d => d.id !== device.id)
  hideCtx()
}

function startDevEdit(prop) {
  devices.value.forEach(d => d.properties.forEach(p => { p.editing = false }))
  prop.editing = true
  nextTick(() => {
    const el = document.querySelector('.dev-prop-editing input')
    if (el) { el.focus(); el.select?.() }
  })
}
function stopDevEdit(prop) { prop.editing = false }
function devEditKey(e, prop) { if (e.key === 'Enter' || e.key === 'Escape') stopDevEdit(prop) }

onMounted(() => {
  window.addEventListener('click', hideCtx)
  // Re-baseline after App.vue's async startup fetches have completed
  savedDevicesJson.value  = devicesSnapshot.value
  savedPlotInterval.value = chartPlotInterval.value
})
onUnmounted(() => window.removeEventListener('click', hideCtx))

// ── General settings editing ───────────────────────────────────────────────
function startEdit(s) { if (s.type !== 'group') s.editing = true }
function stopEdit(s)  { s.editing = false }
function handleKeyDown(e, s) { if (e.key === 'Enter' || e.key === 'Escape') stopEdit(s) }

// ── Save / Load ────────────────────────────────────────────────────────────
async function saveSettings() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/devices`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authToken?.value}`,
      },
      body: JSON.stringify({ devices: devices.value }),
    })
    if (res.ok) {
      saveAppSettings()
      updateSavedSnapshot()
      addLog?.('Settings saved successfully', 'Info')
    } else {
      addLog?.(`Settings save failed (${res.status})`, 'Warning')
    }
  } catch {
    addLog?.('Settings save failed — backend unreachable', 'Error')
  }
}

async function loadSettings() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/devices`)
    if (res.ok) {
      const data = await res.json()
      if (data.devices?.length) devices.value = data.devices
    }
  } catch { /* backend unreachable */ }
  updateSavedSnapshot()
}

// Device configs are loaded by App.vue on startup.
// The Load Settings button is still available for a manual refresh.
</script>

<template>
  <div class="settings-view" @click="hideCtx">
    <div class="view-toolbar">
      <button class="toolbar-btn" @click.stop="saveSettings">💾 Save Settings</button>
      <span v-if="unsavedChanges" class="unsaved-indicator">⚠ Unsaved changes</span>
      <button class="toolbar-btn" @click.stop="loadSettings">📂 Load Settings (last saved)</button>
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
          <tr
            v-for="s in visibleSettings"
            :key="s.id"
            :class="{ 'settings-group-row': s.type === 'group' }"
            :style="s.type === 'group' ? { cursor: 'pointer' } : {}"
            @click="s.type === 'group' ? s.expanded = !s.expanded : null"
          >
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
                <input
                  v-else
                  :type="s.type === 'int' ? 'number' : 'text'"
                  v-model="s.value"
                  @blur="stopEdit(s)"
                  @keydown="handleKeyDown($event, s)"
                  style="width:100%"
                  autofocus
                />
              </template>
            </td>
            <td>{{ s.description }}</td>
          </tr>

          <!-- ── Device Connections section ── -->
          <!-- Root row -->
          <tr
            class="settings-group-row dc-root-row"
            style="cursor:pointer"
            @click.stop="dcExpanded = !dcExpanded"
            @contextmenu="e => showCtx(e, 'category', null)"
          >
            <td colspan="3">
              <span class="dc-toggle">{{ dcExpanded ? '▾' : '▸' }}</span>
              🔗 Device Connections
              <span class="dc-hint">right-click to add</span>
            </td>
          </tr>

          <template v-if="dcExpanded">
            <template v-for="device in devices" :key="device.id">
              <!-- Device row -->
              <tr
                class="dc-device-row"
                style="cursor:pointer"
                @click.stop="device.expanded = !device.expanded"
                @contextmenu="e => showCtx(e, 'device', device)"
              >
                <td colspan="3">
                  <span class="depth-indent" style="width:20px" />
                  <span class="dc-toggle">{{ device.expanded ? '▾' : '▸' }}</span>
                  <span>{{ device.type === DEVICE_TYPES.Com ? '🔌' : '🌐' }}</span>
                  {{ device.name }}
                </td>
              </tr>

              <!-- Property rows -->
              <template v-if="device.expanded">
                <tr
                  v-for="prop in device.properties"
                  :key="prop.name"
                  :class="{ 'dev-prop-editing': prop.editing }"
                >
                  <td>
                    <span class="depth-indent" style="width:40px" />
                    {{ prop.name }}
                  </td>
                  <td @dblclick.stop="startDevEdit(prop)">
                    <span v-if="!prop.editing" style="cursor:text">{{ prop.value }}</span>
                    <input
                      v-else
                      :type="prop.propType === 'int' ? 'number' : 'text'"
                      v-model="prop.value"
                      @blur="stopDevEdit(prop)"
                      @keydown="devEditKey($event, prop)"
                      style="width:100%"
                      autofocus
                    />
                  </td>
                  <td>{{ prop.description }}</td>
                </tr>
              </template>
            </template>
          </template>

          <!-- ── Charting section ── -->
          <tr class="settings-group-row">
            <td colspan="3">
              <span class="dc-toggle">▾</span>
              📈 Charting
            </td>
          </tr>
          <tr>
            <td>
              <span class="depth-indent" style="width:20px" />
              Plot Interval (s)
            </td>
            <td>
              <input
                type="number"
                v-model.number="plotInterval"
                min="1"
                max="3600"
                step="1"
                style="width:90px"
              />
            </td>
            <td>Controls how often sensor data is plotted on the chart and saved to the database (1 s – 3600 s)</td>
          </tr>

        </tbody>
      </table>
    </div>

    <!-- Context menu -->
    <div
      v-if="ctx.visible"
      class="dc-context-menu"
      :style="{ top: ctx.y + 'px', left: ctx.x + 'px' }"
      @click.stop
    >
      <template v-if="ctx.mode === 'category'">
        <button class="ctx-item" @click="addDevice(DEVICE_TYPES.Com)"><span>🔌</span> Add COM Device</button>
        <button class="ctx-item" @click="addDevice(DEVICE_TYPES.Ip)"><span>🌐</span> Add IP Device</button>
      </template>
      <template v-else-if="ctx.mode === 'device'">
        <button class="ctx-item ctx-item-danger" @click="deleteDevice(ctx.target)"><span>🗑</span> Delete</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.unsaved-indicator {
  font-size: 12px;
  color: #e6a817;
  font-weight: 600;
  align-self: center;
}

.dc-root-row td { font-weight: 700; }
.dc-device-row  { background: var(--bg-table-alt); font-weight: 600; font-size: 12px; }
.dc-device-row:hover td { background: var(--bg-table-hover); }

.dc-toggle { font-size: 10px; color: var(--text-secondary); margin-right: 4px; }
.dc-hint   { font-size: 10px; color: var(--text-secondary); font-weight: 400; margin-left: 8px; }

.dc-context-menu {
  position: fixed;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  z-index: 500;
  min-width: 160px;
  padding: 3px 0;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 7px 14px;
  text-align: left;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: pointer;
}
.ctx-item:hover { background: var(--bg-ribbon-btn-hover); }
.ctx-item-danger { color: #e53935; }
.ctx-item-danger:hover { background: #fdecea; }
</style>
