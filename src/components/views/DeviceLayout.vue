<script setup>
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import AddSensorModal from '../AddSensorModal.vue'

const BACKEND_URL  = inject('BACKEND_URL', 'http://localhost:5176')
const authToken    = inject('authToken')
const currentUser  = inject('currentUser')
const addLog       = inject('addLog', () => {})
const items        = inject('layoutItems')
const devices      = inject('devices', ref([]))

const canOperate = computed(() =>
  currentUser?.value?.role === 'Admin' || currentUser?.value?.role === 'Operator'
)

const isEditMode         = ref(false)
const showAddMenu        = ref(false)
const showAddSensorModal = ref(false)
const showColorPicker     = ref(false)
const showTextColorPicker = ref(false)
const selectedId          = ref(null)

// Track whether a mousedown started inside the toolbar so a drag that ends
// anywhere doesn't accidentally clear the selection.
// Reset is deferred via setTimeout so the click event fires first.
let mouseDownInToolbar = false
const resetToolbarFlag = () => setTimeout(() => { mouseDownInToolbar = false }, 0)

function onKeyDown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && isEditMode.value && selectedId.value !== null) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    deleteSelected()
  }
}

onMounted(() => {
  loadLayout()
  window.addEventListener('mouseup', resetToolbarFlag)
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('mouseup', resetToolbarFlag)
  window.removeEventListener('keydown', onKeyDown)
})

const PRESET_COLORS = [
  '#1e90ff', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#ffeb3b', '#ff9800',
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#795548', '#607d8b', '#9e9e9e', '#ffffff',
  '#000000',
]

let nextId = 1

async function loadLayout() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/layout`)
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      // Normalise fields added after initial save
      data.forEach(item => {
        if (item.type !== 'sensor') return
        if (item.driver === 'relay' && item.relayState == null)
          item.relayState = 'off'
        if (item.driver === 'collision-detector' && (item.value == null || item.value === '--' || item.value === 'CLEAR'))
          item.value = 'No Contact'
      })
      items.value = data
      nextId = Math.max(...data.map(i => i.id), 0) + 1

      // Register all simulated sensors in the backend service so their state
      // is authoritative there; update local state from whatever the service returns.
      for (const item of items.value.filter(i => i.type === 'sensor' && i.connection === 'Simulated')) {
        await registerSimulatedSensor(item)
      }
    }
  } catch {
    // Backend unreachable — start with empty canvas
  }
}

// Register a simulated sensor in the backend SensorSimulationService.
// On success, syncs local tile state from the backend's current value.
async function registerSimulatedSensor(item) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/simulate/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ canvasId: item.id, name: item.name, driver: item.driver }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (item.driver === 'relay')              item.relayState = data.state       // 'on' | 'off'
    if (item.driver === 'collision-detector') item.value      = data.stateLabel  // 'TRIGGERED' | 'CLEAR'
  } catch { /* backend unreachable — local state stands */ }
}

async function saveLayout() {
  if (!authToken?.value) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/layout`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authToken.value}`,
      },
      body: JSON.stringify(items.value),
    })
    if (!res.ok) addLog(`Layout save failed (HTTP ${res.status})`, 'Warning')
  } catch (err) {
    addLog(`Layout save failed: ${err.message}`, 'Warning')
  }
}

const selectedItem     = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
const selectedIsRect   = computed(() => selectedItem.value?.type === 'rect')
const selectedIsSensor = computed(() => selectedItem.value?.type === 'sensor')
const selectedHasColor = computed(() => selectedIsRect.value || selectedIsSensor.value)

// Minimum canvas size — pinned to the size at drag-start so that dragging an item
// upward/leftward can't shrink the canvas mid-drag (which clamps scrollTop and
// causes the position formula to snap the item to the top).
const canvasMinW = ref(0)
const canvasMinH = ref(0)

const canvasStyle = computed(() => {
  const PAD = 40
  let maxX = canvasMinW.value
  let maxY = canvasMinH.value
  for (const item of items.value) {
    maxX = Math.max(maxX, item.x + (item.w ?? 120) + PAD)
    maxY = Math.max(maxY, item.y + (item.h ?? 60)  + PAD)
  }
  return { width: maxX + 'px', height: maxY + 'px' }
})

const originalColor    = ref(null)
const originalTextColor = ref(null)

function rectTextColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff'
}

function selectRect(item, e) {
  e.stopPropagation()
  if (isEditMode.value) selectedId.value = item.id
}

function startEdit() {
  isEditMode.value  = true
  showAddMenu.value = false
  closeColorPicker()
  closeTextColorPicker()
}

function doneEdit() {
  isEditMode.value  = false
  selectedId.value  = null
  showAddMenu.value = false
  closeColorPicker()
  closeTextColorPicker()
  saveLayout()
}

function addSensor() {
  showAddMenu.value = false
  showAddSensorModal.value = true
}

async function confirmAddSensor({ name, connection, driver, pin }) {
  const id = nextId++
  const extra =
    driver === 'relay'              ? { relayState: 'off' }             :
    driver === 'collision-detector' ? { value: 'No Contact', unit: '' } :
                                      { value: '--',         unit: '' }
  const newItem = { id, type: 'sensor', name, connection, driver, pin: pin ?? null, x: 80, y: 80, color: '#1e90ff', textColor: null, ...extra }
  items.value.push(newItem)
  showAddSensorModal.value = false
  isEditMode.value = true
  saveLayout()

  // Register the new simulated sensor immediately so the backend is aware of it
  if (connection === 'Simulated') await registerSimulatedSensor(newItem)
}

function addRectangle() {
  const id = nextId++
  items.value.push({
    id, type: 'rect', name: 'New Zone',
    x: 80, y: 80, w: 200, h: 150,
    color: '#1e90ff', textColor: null, fontSize: 16, fontWeight: 'normal', textAlign: 'left',
  })
  showAddMenu.value = false
  isEditMode.value = true
  saveLayout()
}

function deleteSelected() {
  if (selectedId.value !== null) {
    items.value      = items.value.filter(s => s.id !== selectedId.value)
    selectedId.value = null
    saveLayout()
  }
}

// Text formatting
function toggleBold() {
  if (selectedItem.value)
    selectedItem.value.fontWeight = selectedItem.value.fontWeight === 'bold' ? 'normal' : 'bold'
}

function setAlign(align) {
  if (selectedItem.value) selectedItem.value.textAlign = align
}

function clampFontSize(val) {
  return Math.max(8, Math.min(72, Number(val) || 13))
}

const wrapperRef = ref(null)

// Drag to move — uses wrapper-relative coords + auto-scroll near edges
function startDrag(item, e) {
  if (!isEditMode.value) return
  e.preventDefault()
  selectedId.value = item.id

  const wrapper = wrapperRef.value
  const r0 = wrapper.getBoundingClientRect()
  const ox = (e.clientX - r0.left + wrapper.scrollLeft) - item.x
  const oy = (e.clientY - r0.top  + wrapper.scrollTop)  - item.y

  // Pin canvas size so dragging up/left can't shrink it and clamp scrollTop mid-drag
  canvasMinW.value = parseInt(canvasStyle.value.width)  || 0
  canvasMinH.value = parseInt(canvasStyle.value.height) || 0

  const EDGE = 40, SPEED = 4
  let mx = e.clientX, my = e.clientY, rafId

  const frame = () => {
    const r = wrapper.getBoundingClientRect()
    const rx = mx - r.left, ry = my - r.top
    if (rx < EDGE)                 wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - SPEED)
    else if (rx > r.width  - EDGE) wrapper.scrollLeft += SPEED
    if (ry < EDGE)                 wrapper.scrollTop  = Math.max(0, wrapper.scrollTop  - SPEED)
    else if (ry > r.height - EDGE) wrapper.scrollTop  += SPEED
    // Clamp to wrapper min edges so mouse exiting above/left doesn't snap item to 0
    const cx = Math.max(r.left, mx)
    const cy = Math.max(r.top,  my)
    item.x = Math.max(0, cx - r.left + wrapper.scrollLeft - ox)
    item.y = Math.max(0, cy - r.top  + wrapper.scrollTop  - oy)
    rafId = requestAnimationFrame(frame)
  }

  const onMove = ev => { mx = ev.clientX; my = ev.clientY }
  const onUp   = () => {
    cancelAnimationFrame(rafId)
    canvasMinW.value = 0
    canvasMinH.value = 0
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    saveLayout()
  }
  rafId = requestAnimationFrame(frame)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// Resize grip
function startResize(item, e) {
  e.preventDefault(); e.stopPropagation()
  const sx = e.clientX, sy = e.clientY, sw = item.w, sh = item.h
  const move = ev => { item.w = Math.max(100, sw + ev.clientX - sx); item.h = Math.max(50, sh + ev.clientY - sy) }
  const up   = ()  => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); saveLayout() }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// Color picker
function pickColor(color) {
  if (selectedItem.value && selectedHasColor.value) selectedItem.value.color = color
}

function confirmColor() {
  originalColor.value   = null
  showColorPicker.value = false
}

function closeColorPicker() {
  if (originalColor.value && selectedItem.value && selectedHasColor.value)
    selectedItem.value.color = originalColor.value
  originalColor.value   = null
  showColorPicker.value = false
}

function openColorPicker() {
  originalColor.value   = selectedItem.value?.color ?? null
  showColorPicker.value = true
}

// Text color picker
function openTextColorPicker() {
  originalTextColor.value   = selectedItem.value?.textColor ?? null   // snapshot for Cancel
  showTextColorPicker.value = true
  showColorPicker.value     = false   // close bg picker if open
}

function pickTextColor(color) {
  if (selectedItem.value && selectedHasColor.value) selectedItem.value.textColor = color
}

function confirmTextColor() {
  originalTextColor.value   = null
  showTextColorPicker.value = false
}

// revert defaults to false — clicking away confirms the pick, Cancel explicitly passes true
function closeTextColorPicker(revert = false) {
  if (revert && selectedItem.value && selectedHasColor.value)
    selectedItem.value.textColor = originalTextColor.value
  originalTextColor.value   = null
  showTextColorPicker.value = false
}

function resetTextColorToAuto() {
  if (selectedItem.value) selectedItem.value.textColor = null
  originalTextColor.value   = null
  showTextColorPicker.value = false
}

// Relay control — resolve connection string to a numeric device id
function resolveDeviceId(connection) {
  if (!connection || connection === 'Simulated') return null
  for (const d of devices.value) {
    if (d.type === 'ip') {
      const ip = d.properties.find(p => p.name === 'IpAddress')?.value?.trim()
      if (ip === connection) return d.id
    }
  }
  return null
}

async function handleRelayChange(item, state) {
  item.relayState = state  // optimistic local update

  if (item.connection === 'Simulated') {
    // Route to backend simulation service
    try {
      await fetch(`${BACKEND_URL}/api/simulate/relay/${item.id}/${state}`, {
        method:  'POST',
        headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      })
    } catch (err) {
      addLog(`Simulated relay command failed: ${err.message}`, 'Warning')
    }
  } else {
    // Route to real hardware via device proxy endpoint
    const deviceId = resolveDeviceId(item.connection)
    if (deviceId !== null) {
      if (item.pin == null) {
        addLog(`Relay "${item.name}" has no pin configured — edit and re-add it`, 'Warning')
      } else {
        try {
          await fetch(`${BACKEND_URL}/api/devices/${deviceId}/do`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ pin: item.pin, state: state === 'on' }),
          })
        } catch (err) {
          addLog(`Relay command failed: ${err.message}`, 'Warning')
        }
      }
    }
  }
  saveLayout()
}

// Simulated collision detector toggle — calls backend to keep state authoritative there
async function toggleCollisionSim(item) {
  const nowTriggered = item.value !== 'Collision!'
  const endpoint     = nowTriggered ? 'trigger' : 'release'
  item.value = nowTriggered ? 'Collision!' : 'No Contact'  // optimistic update

  try {
    await fetch(`${BACKEND_URL}/api/simulate/di/${item.id}/${endpoint}`, {
      method:  'POST',
      headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
    })
  } catch (err) {
    addLog(`Simulated DI command failed: ${err.message}`, 'Warning')
  }
  saveLayout()
}

// Canvas click — deselects and closes menus, but not if the mouse was
// pressed down in the toolbar (user was dragging a text selection).
function onCanvasClick(e) {
  if (mouseDownInToolbar) {
    mouseDownInToolbar = false
    return
  }
  if (!e.target.closest('.dropdown-wrapper'))       showAddMenu.value = false
  if (!e.target.closest('.color-picker-wrap'))      closeColorPicker()
  if (!e.target.closest('.text-color-picker-wrap')) closeTextColorPicker()
  if (!e.target.closest('.sensor-tile') && !e.target.closest('.rect-tile')) selectedId.value = null
}
</script>

<template>
  <div class="device-layout" @click="onCanvasClick">

    <div
      class="view-toolbar"
      @mousedown="mouseDownInToolbar = true"
    >
      <!-- ── Non-edit mode ── -->
      <template v-if="!isEditMode">
        <button v-if="canOperate" class="toolbar-btn" @click.stop="startEdit">✏ Edit</button>
        <div v-if="canOperate" class="dropdown-wrapper">
          <button class="toolbar-btn" @click.stop="showAddMenu = !showAddMenu">＋ Add ▾</button>
          <div v-if="showAddMenu" class="dropdown-menu">
            <button @click="addSensor">Add Device</button>
            <button @click="addRectangle">Rectangle</button>
          </div>
        </div>
      </template>

      <!-- ── Edit mode ── -->
      <template v-else>
        <button v-if="selectedId !== null" class="toolbar-btn toolbar-btn-danger" @click="deleteSelected">🗑 Delete</button>
        <button class="toolbar-btn active" @click="doneEdit">✔ Done Editing</button>
        <button v-if="selectedIsSensor" class="toolbar-btn" @click.stop="() => {}">↺ Reconnect</button>

        <!-- Background + Text color pickers — available for both sensors and rects -->
        <template v-if="selectedHasColor">
          <div class="toolbar-sep" />

          <!-- Background color -->
          <div class="color-picker-wrap" @click.stop>
            <button class="toolbar-btn color-preview-btn" @click="showColorPicker = !showColorPicker; closeTextColorPicker()">
              <span class="color-preview-dot" :style="{ background: selectedItem.color }" />
              Color
            </button>
            <div v-if="showColorPicker" class="color-picker-popup">
              <div class="color-swatches">
                <button
                  v-for="c in PRESET_COLORS" :key="c"
                  class="color-swatch"
                  :class="{ active: selectedItem.color === c }"
                  :style="{ background: c, borderColor: c === '#ffffff' ? '#ccc' : 'transparent' }"
                  @click="pickColor(c)"
                />
              </div>
              <div class="color-picker-footer">
                <button class="btn btn-primary" style="font-size:12px;padding:4px 14px" @click="confirmColor">OK</button>
                <button class="toolbar-btn" style="font-size:12px" @click="closeColorPicker">Cancel</button>
              </div>
            </div>
          </div>

          <!-- Text color -->
          <div class="text-color-picker-wrap" @click.stop>
            <button class="toolbar-btn color-preview-btn" @click="openTextColorPicker">
              <span class="color-preview-dot" :style="{ background: selectedItem.textColor ?? '#ffffff', border: selectedItem.textColor ? 'none' : '1px solid #aaa' }" />
              Text
            </button>
            <div v-if="showTextColorPicker" class="color-picker-popup">
              <div class="color-swatches">
                <button
                  v-for="c in PRESET_COLORS" :key="c"
                  class="color-swatch"
                  :class="{ active: selectedItem.textColor === c }"
                  :style="{ background: c, borderColor: c === '#ffffff' ? '#ccc' : 'transparent' }"
                  @click="pickTextColor(c)"
                />
              </div>
              <div class="color-picker-footer">
                <button class="btn btn-primary" style="font-size:12px;padding:4px 14px" @click="confirmTextColor">OK</button>
                <button class="toolbar-btn" style="font-size:12px" @click="resetTextColorToAuto">Auto</button>
                <button class="toolbar-btn" style="font-size:12px" @click="closeTextColorPicker()">Cancel</button>
              </div>
            </div>
          </div>
        </template>

        <!-- Text formatting — rects only -->
        <template v-if="selectedIsRect">
          <div class="toolbar-sep" />

          <!-- Label -->
          <input
            type="text"
            class="toolbar-text-input"
            v-model="selectedItem.name"
            placeholder="Label"
            @click.stop
          />

          <div class="toolbar-sep" />

          <!-- Bold -->
          <button
            class="toolbar-btn toolbar-bold-btn"
            :class="{ active: selectedItem.fontWeight === 'bold' }"
            title="Bold"
            @click.stop="toggleBold"
          >B</button>

          <!-- Font size -->
          <input
            type="number"
            class="toolbar-fontsize-input"
            :value="selectedItem.fontSize"
            min="8" max="72"
            @change.stop="selectedItem.fontSize = clampFontSize($event.target.value)"
            @click.stop
            title="Font size"
          />

          <div class="toolbar-sep" />

          <!-- Alignment -->
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'left' }"   title="Align left"   @click.stop="setAlign('left')"  >⬅</button>
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'center' }" title="Center"       @click.stop="setAlign('center')">↔</button>
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'right' }"  title="Align right"  @click.stop="setAlign('right')" >➡</button>
        </template>
      </template>
    </div>

    <div class="device-canvas-wrapper" ref="wrapperRef">
      <div class="device-canvas" :style="canvasStyle">
        <template v-for="item in items" :key="item.id">

          <!-- Sensor tile -->
          <div
            v-if="item.type === 'sensor'"
            class="sensor-tile"
            :class="{ editable: isEditMode, selected: selectedId === item.id }"
            :style="{
              left:       item.x + 'px',
              top:        item.y + 'px',
              background: item.color || 'var(--bg-sensor-tile)',
            }"
            @mousedown="startDrag(item, $event)"
            @click.stop="isEditMode && (selectedId = item.id)"
          >
            <div class="sensor-tile-name" :style="{ color: item.textColor || null }">{{ item.name }}</div>

            <!-- Relay: ON / OFF radio buttons -->
            <template v-if="item.driver === 'relay'">
              <div class="relay-controls" @mousedown.stop @click.stop>
                <label
                  class="relay-label"
                  :class="{ 'relay-disabled': !canOperate }"
                  :style="{ color: item.textColor || null }"
                >
                  <input
                    type="radio"
                    :name="'relay-' + item.id"
                    value="on"
                    :checked="item.relayState === 'on'"
                    :disabled="!canOperate"
                    @change="handleRelayChange(item, 'on')"
                  /> ON
                </label>
                <label
                  class="relay-label"
                  :class="{ 'relay-disabled': !canOperate }"
                  :style="{ color: item.textColor || null }"
                >
                  <input
                    type="radio"
                    :name="'relay-' + item.id"
                    value="off"
                    :checked="item.relayState !== 'on'"
                    :disabled="!canOperate"
                    @change="handleRelayChange(item, 'off')"
                  /> OFF
                </label>
              </div>
              <div v-if="item.connection === 'Simulated'" class="sim-badge">SIM</div>
            </template>

            <!-- Collision Detector -->
            <template v-else-if="item.driver === 'collision-detector'">
              <div
                class="collision-state"
                :style="{
                  color: item.textColor ||
                    (item.value === 'Collision!' ? '#ff5252' : '#69f0ae')
                }"
              >
                <span class="collision-dot" />
                {{ item.value ?? 'No Contact' }}
              </div>
              <!-- Simulate trigger/release — only for Simulated connection + operators -->
              <button
                v-if="item.connection === 'Simulated' && canOperate"
                class="sim-trigger-btn"
                :class="{ 'sim-trigger-btn--active': item.value === 'Collision!' }"
                @mousedown.stop
                @click.stop="toggleCollisionSim(item)"
              >{{ item.value === 'Collision!' ? 'Release' : 'Trigger' }}</button>
              <div v-if="item.connection === 'Simulated'" class="sim-badge">SIM</div>
            </template>

            <!-- Default sensors: live value + unit -->
            <template v-else>
              <div class="sensor-tile-value" :style="{ color: item.textColor || null }">{{ item.value }}</div>
              <div class="sensor-tile-unit"  :style="{ color: item.textColor || null }">{{ item.unit }}</div>
            </template>
          </div>

          <!-- Rectangle tile -->
          <div
            v-else-if="item.type === 'rect'"
            class="rect-tile"
            :class="{ editable: isEditMode, selected: selectedId === item.id }"
            :style="{
              left: item.x + 'px', top: item.y + 'px',
              width: item.w + 'px', height: item.h + 'px',
              background: item.color,
              color: rectTextColor(item.color),
            }"
            @mousedown="startDrag(item, $event)"
            @click="selectRect(item, $event)"
          >
            <span
              class="rect-tile-name"
              :style="{
                fontSize:   item.fontSize + 'px',
                fontWeight: item.fontWeight,
                textAlign:  item.textAlign,
                color:      item.textColor || rectTextColor(item.color),
              }"
            >{{ item.name }}</span>
            <button
              v-if="isEditMode"
              class="rect-resize-grip"
              :style="{ color: rectTextColor(item.color) }"
              @mousedown.stop="startResize(item, $event)"
            >◢</button>
          </div>

        </template>
      </div>
    </div>

    <AddSensorModal
      v-if="showAddSensorModal"
      @add="confirmAddSensor"
      @close="showAddSensorModal = false"
    />

    <button v-if="canOperate" class="reconnect-all-btn" @click.stop="() => {}">↺ Reconnect All Devices</button>
  </div>
</template>

<style scoped>
.rect-tile            { z-index: 1; }
.sensor-tile          { z-index: 2; }
.sensor-tile.selected { outline: 2px solid var(--accent); }
.rect-tile.selected   { outline: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }

.reconnect-all-btn {
  position: absolute;
  bottom: 20px;
  left: 14px;
  z-index: 10;
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
}
.reconnect-all-btn:hover { background: var(--bg-ribbon-btn-hover); }

/* ── Relay tile controls ── */
.relay-controls {
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin-top: 6px;
}

.relay-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.relay-label input[type="radio"] {
  cursor: pointer;
  width: 14px;
  height: 14px;
  accent-color: currentColor;
}

.relay-label.relay-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.relay-label.relay-disabled input[type="radio"] {
  cursor: not-allowed;
}

/* ── Collision Detector tile ── */
.collision-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-top: 5px;
}

.collision-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* Trigger / Release simulation button */
.sim-trigger-btn {
  margin-top: 6px;
  padding: 2px 9px;
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.30);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  transition: background 0.12s;
}
.sim-trigger-btn:hover                { background: rgba(255, 255, 255, 0.20); }
.sim-trigger-btn--active              { border-color: rgba(255, 82, 82, 0.60); }
.sim-trigger-btn--active:hover        { background: rgba(255, 82, 82, 0.18); }

/* ── SIM badge — shown on any simulated sensor ── */
.sim-badge {
  margin-top: 5px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
}
</style>
