<script setup>
import { ref, computed, inject } from 'vue'

const emit = defineEmits(['add', 'close'])

const devices = inject('devices', ref([]))

const displayName = ref('')
const selectedConnection = ref('Simulated')
const selectedDriver = ref('Temperature')

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

const drivers = [
  'Temperature',
  'Pressure',
  'Flow Rate',
  'Humidity',
  'Voltage',
  'Current',
  'Generic Analog',
]

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
        <label class="modal-label">Sensor Driver:</label>
        <select class="modal-input" v-model="selectedDriver">
          <option v-for="d in drivers" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" :disabled="!displayName.trim()" @click="submit">Add Sensor</button>
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
