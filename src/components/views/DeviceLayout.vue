<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isEditMode      = ref(false)
const showAddMenu     = ref(false)
const showColorPicker = ref(false)
const selectedId      = ref(null)

// Track whether a mousedown started inside the toolbar so a drag that ends
// anywhere doesn't accidentally clear the selection.
// Reset is deferred via setTimeout so the click event fires first.
let mouseDownInToolbar = false
const resetToolbarFlag = () => setTimeout(() => { mouseDownInToolbar = false }, 0)
onMounted(()   => window.addEventListener('mouseup', resetToolbarFlag))
onUnmounted(() => window.removeEventListener('mouseup', resetToolbarFlag))

const PRESET_COLORS = [
  '#1e90ff', '#0d47a1', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#ffeb3b', '#ff9800',
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#795548', '#607d8b', '#9e9e9e', '#ffffff',
]

const items = ref([
  { id: 1, type: 'sensor', name: 'Temperature 1', value: '--', unit: '°C',  x: 40,  y: 40 },
  { id: 2, type: 'sensor', name: 'Pressure 1',    value: '--', unit: 'PSI', x: 200, y: 40 },
  { id: 3, type: 'sensor', name: 'Flow Rate 1',   value: '--', unit: 'L/m', x: 40,  y: 140 },
  { id: 4, type: 'rect', name: 'Zone A', x: 360, y: 40, w: 200, h: 150,
    color: '#1e90ff', fontSize: 16, fontWeight: 'normal', textAlign: 'left' },
])

let nextId = 5

const selectedItem   = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
const selectedIsRect = computed(() => selectedItem.value?.type === 'rect')

const originalColor = ref(null)

function rectTextColor(hex) {
  if (!hex) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff'
}

function selectRect(item, e) {
  e.stopPropagation()
  selectedId.value = item.id
}

function startEdit() {
  isEditMode.value  = true
  showAddMenu.value = false
  closeColorPicker()
}

function doneEdit() {
  isEditMode.value  = false
  selectedId.value  = null
  showAddMenu.value = false
  closeColorPicker()
}

function addSensor() {
  items.value.push({ id: nextId++, type: 'sensor', name: `Sensor ${nextId - 1}`, value: '--', unit: '', x: 80, y: 80 })
  showAddMenu.value = false
}

function addRectangle() {
  items.value.push({
    id: nextId++, type: 'rect', name: 'New Zone',
    x: 80, y: 80, w: 200, h: 150,
    color: '#1e90ff', fontSize: 16, fontWeight: 'normal', textAlign: 'left',
  })
  showAddMenu.value = false
}

function deleteSelected() {
  if (selectedId.value !== null) {
    items.value      = items.value.filter(s => s.id !== selectedId.value)
    selectedId.value = null
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

// Drag to move
function startDrag(item, e) {
  if (!isEditMode.value) return
  e.preventDefault()
  selectedId.value = item.id
  const ox = e.clientX - item.x, oy = e.clientY - item.y
  const move = ev => { item.x = Math.max(0, ev.clientX - ox); item.y = Math.max(0, ev.clientY - oy) }
  const up   = ()  => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// Resize grip
function startResize(item, e) {
  e.preventDefault(); e.stopPropagation()
  const sx = e.clientX, sy = e.clientY, sw = item.w, sh = item.h
  const move = ev => { item.w = Math.max(100, sw + ev.clientX - sx); item.h = Math.max(50, sh + ev.clientY - sy) }
  const up   = ()  => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// Color picker
function pickColor(color) {
  if (selectedItem.value && selectedIsRect.value) selectedItem.value.color = color
}

function confirmColor() {
  originalColor.value   = null
  showColorPicker.value = false
}

function closeColorPicker() {
  if (originalColor.value && selectedItem.value && selectedIsRect.value)
    selectedItem.value.color = originalColor.value
  originalColor.value   = null
  showColorPicker.value = false
}

function openColorPicker() {
  originalColor.value   = selectedItem.value?.color ?? null
  showColorPicker.value = true
}

// Canvas click — deselects and closes menus, but not if the mouse was
// pressed down in the toolbar (user was dragging a text selection).
function onCanvasClick(e) {
  if (mouseDownInToolbar) {
    mouseDownInToolbar = false
    return
  }
  if (!e.target.closest('.dropdown-wrapper'))  showAddMenu.value = false
  if (!e.target.closest('.color-picker-wrap')) closeColorPicker()
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
        <button class="toolbar-btn" @click.stop="startEdit">✏ Edit</button>
        <div class="dropdown-wrapper">
          <button class="toolbar-btn" @click.stop="showAddMenu = !showAddMenu">＋ Add ▾</button>
          <div v-if="showAddMenu" class="dropdown-menu">
            <button @click="addSensor">Sensor</button>
            <button @click="addRectangle">Rectangle</button>
          </div>
        </div>
        <button class="toolbar-btn" @click.stop="() => {}">↺ Reconnect</button>
      </template>

      <!-- ── Edit mode ── -->
      <template v-else>
        <button class="toolbar-btn" :disabled="selectedId === null" @click="deleteSelected">🗑 Delete</button>
        <button class="toolbar-btn active" @click="doneEdit">✔ Done Editing</button>

        <!-- Text + color formatting — only when a rect is selected -->
        <template v-if="selectedIsRect">
          <div class="toolbar-sep" />

          <!-- Color -->
          <div class="color-picker-wrap" @click.stop>
            <button class="toolbar-btn color-preview-btn" @click="showColorPicker = !showColorPicker">
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

    <div class="device-canvas-wrapper">
      <div class="device-canvas">
        <template v-for="item in items" :key="item.id">

          <!-- Sensor tile -->
          <div
            v-if="item.type === 'sensor'"
            class="sensor-tile"
            :class="{ editable: isEditMode, selected: selectedId === item.id }"
            :style="{ left: item.x + 'px', top: item.y + 'px' }"
            @mousedown="startDrag(item, $event)"
            @click.stop="isEditMode && (selectedId = item.id)"
          >
            <div class="sensor-tile-name">{{ item.name }}</div>
            <div class="sensor-tile-value">{{ item.value }}</div>
            <div class="sensor-tile-unit">{{ item.unit }}</div>
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
  </div>
</template>

<style scoped>
.rect-tile            { z-index: 1; }
.sensor-tile          { z-index: 2; }
.sensor-tile.selected { outline: 2px solid var(--accent); }
.rect-tile.selected   { outline: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.4); }
</style>
