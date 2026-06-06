<script setup>
import { ref } from 'vue'

const isEditMode = ref(false)
const showAddMenu = ref(false)
const selectedId = ref(null)

const sensors = ref([
  { id: 1, type: 'sensor', name: 'Temperature 1', value: '--', unit: '°C', x: 40,  y: 40 },
  { id: 2, type: 'sensor', name: 'Pressure 1',    value: '--', unit: 'PSI', x: 200, y: 40 },
  { id: 3, type: 'sensor', name: 'Flow Rate 1',   value: '--', unit: 'L/m', x: 40,  y: 140 },
  { id: 4, type: 'rect',   name: 'Zone A',         value: '',  unit: '',   x: 360, y: 40,  w: 160, h: 80 },
])

let nextId = 5

function startEdit() { isEditMode.value = true; showAddMenu.value = false }
function doneEdit()  { isEditMode.value = false; selectedId.value = null; showAddMenu.value = false }

function addSensor() {
  sensors.value.push({ id: nextId++, type: 'sensor', name: `Sensor ${nextId}`, value: '--', unit: '', x: 80, y: 80 })
  showAddMenu.value = false
}

function addRectangle() {
  sensors.value.push({ id: nextId++, type: 'rect', name: 'New Zone', value: '', unit: '', x: 80, y: 80, w: 140, h: 70 })
  showAddMenu.value = false
}

function deleteSelected() {
  if (selectedId.value !== null) {
    sensors.value = sensors.value.filter(s => s.id !== selectedId.value)
    selectedId.value = null
  }
}

function startDrag(item, e) {
  if (!isEditMode.value) return
  e.preventDefault()
  selectedId.value = item.id
  const startX = e.clientX - item.x
  const startY = e.clientY - item.y

  function onMove(ev) {
    item.x = Math.max(0, ev.clientX - startX)
    item.y = Math.max(0, ev.clientY - startY)
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function closeAddMenu(e) {
  if (!e.target.closest('.dropdown-wrapper')) showAddMenu.value = false
}
</script>

<template>
  <div class="device-layout" @click="closeAddMenu">
    <div class="view-toolbar">
      <template v-if="!isEditMode">
        <button class="toolbar-btn" @click.stop="startEdit">✏ Edit</button>
        <div class="dropdown-wrapper">
          <button class="toolbar-btn" @click.stop="showAddMenu = !showAddMenu">＋ Add ▾</button>
          <div v-if="showAddMenu" class="dropdown-menu">
            <button @click="addSensor">Sensor</button>
            <button @click="addRectangle">Rectangle</button>
          </div>
        </div>
        <button class="toolbar-btn" @click="() => {}">↺ Reconnect</button>
      </template>
      <template v-else>
        <button
          class="toolbar-btn"
          :class="{ active: selectedId !== null }"
          :disabled="selectedId === null"
          @click="deleteSelected"
        >🗑 Delete</button>
        <button class="toolbar-btn active" @click="doneEdit">✔ Done Editing</button>
      </template>
    </div>

    <div class="device-canvas-wrapper">
      <div class="device-canvas">
        <template v-for="item in sensors" :key="item.id">
          <!-- Sensor tile -->
          <div
            v-if="item.type === 'sensor'"
            class="sensor-tile"
            :class="{ editable: isEditMode, 'selected': selectedId === item.id && isEditMode }"
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
            :class="{ editable: isEditMode }"
            :style="{ left: item.x + 'px', top: item.y + 'px', width: (item.w || 140) + 'px', height: (item.h || 70) + 'px' }"
            @mousedown="startDrag(item, $event)"
            @click.stop="isEditMode && (selectedId = item.id)"
          >
            {{ item.name }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sensor-tile.selected { outline: 2px solid var(--accent); }
</style>
