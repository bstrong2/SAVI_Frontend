<script setup>
import { ref, computed, inject, onMounted } from 'vue'

const emit = defineEmits(['add', 'close'])

const BACKEND_URL = inject('BACKEND_URL', 'http://localhost:5176')
const devices     = inject('devices', ref([]))

const displayName        = ref('')
const selectedConnection = ref('Simulated')
const selectedDriver     = ref('')

// Build connection list from devices + Simulated
const connections = computed(() => {
  const list = [{ label: 'Simulated', value: 'Simulated' }]
  for (const d of devices.value) {
    const deviceName = d.properties.find(p => p.name === 'Device Name')?.value?.trim()
    if (d.type === 'com') {
      const port = d.properties.find(p => p.name === 'ComPort')?.value?.trim()
      if (port) {
        const label = deviceName ? `${deviceName} (${port})` : port
        list.push({ label, value: port })
      }
    } else if (d.type === 'ip') {
      const ip = d.properties.find(p => p.name === 'IpAddress')?.value?.trim()
      if (ip) {
        const label = deviceName ? `${deviceName} (${ip})` : ip
        list.push({ label, value: ip })
      }
    }
  }
  return list
})

// Sensor types fetched from the backend
const sensorTypes = ref([])

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensors`)
    if (res.ok) {
      sensorTypes.value = await res.json()
      if (sensorTypes.value.length) selectedDriver.value = sensorTypes.value[0].id
    }
  } catch { /* backend unreachable — dropdown stays empty */ }
})

function submit() {
  const name = displayName.value.trim()
  if (!name) return
  emit('add', { name, connection: selectedConnection.value, driver: selectedDriver.value })
}

function onKeydown(e) {
  if (e.key === 'Enter') submit()
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-box add-sensor-dialog" @keydown="onKeydown">

      <div class="modal-row">
        <label class="modal-label">Display Name:</label>
        <input
          class="modal-input"
          v-model="displayName"
          placeholder="e.g. Temperature 1"
          autofocus
        />
      </div>

      <div class="modal-row">
        <label class="modal-label">Connection:</label>
        <select class="modal-input" v-model="selectedConnection">
          <option v-for="c in connections" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>

      <div class="modal-row">
        <label class="modal-label">Devices:</label>
        <select class="modal-input" v-model="selectedDriver">
          <option v-for="s in sensorTypes" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" :disabled="!displayName.trim()" @click="submit">Add Device</button>
        <button class="btn btn-secondary" @click="emit('close')">Cancel</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.add-sensor-dialog {
  width: 360px;
}
</style>
