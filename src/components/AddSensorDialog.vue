<script setup>
import { ref, computed, watch, inject, onMounted } from 'vue'
import { DRIVERS, DEVICE_TYPES, DEVICE_PROPS, SIMULATED_TYPES } from '../constants/devices.js'

const emit = defineEmits(['add', 'close'])

const BACKEND_URL = inject('BACKEND_URL')
const devices = inject('devices')

const displayName = ref('')
const selectedConnection = ref(DRIVERS.Simulated)
const selectedDriver = ref('')
const pinNumber = ref(18)

const showPinField = computed(() =>
  selectedConnection.value !== DRIVERS.Simulated &&
  (selectedDriver.value === DRIVERS.Relay || selectedDriver.value === DRIVERS.CollisionDetector)
)

// Build connection list from devices + Simulated
const connections = computed(() => {
  const list = [{ label: 'Simulated', value: DRIVERS.Simulated }]
  for (const d of devices.value) {

    const deviceName = d.properties.find(p => p.name === DEVICE_PROPS.DeviceName)?.value?.trim()
    
    if (d.type === DEVICE_TYPES.Com) {
      const port = d.properties.find(p => p.name === DEVICE_PROPS.ComPort)?.value?.trim()
      if (port) {
        const label = deviceName ? `${deviceName} (${port})` : port
        list.push({ label, value: port })
      }
    } else if (d.type === DEVICE_TYPES.Ip) {

      const ip = d.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()
      
      if (ip) {
        const label = deviceName ? `${deviceName} (${ip})` : ip
        list.push({ label, value: ip })
      }
    }
  }
  return list
})

// Sensor types fetched from the backend (used when a real device is selected)
const sensorTypes = ref([])

// Show simulated types when Simulated is selected, backend types otherwise
const availableTypes = computed(() =>
  selectedConnection.value === DRIVERS.Simulated ? SIMULATED_TYPES : sensorTypes.value
)

// If you switch connection types different sensor types might be different. Check to make sure that the new list
// has the same driver available for selection. If not then put set it to the first selection in the list.
watch(availableTypes, (newAvailableTypes) => {
  console.log('availableTypes changed:', newAvailableTypes)
  console.log('current selectedDriver:', selectedDriver.value)

  if (!newAvailableTypes.length)
    return

  if (!newAvailableTypes.includes(selectedDriver.value)) {
    selectedDriver.value = newAvailableTypes[0]
    console.log('reset selectedDriver to:', selectedDriver.value)
  }
},
// Make sure to run this on mount.
{ immediate: true })

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sensors`)
    if (res.ok) {
      const data = await res.json()
      sensorTypes.value = data.map(t => t.id)
    }
  } catch (e){
      // At this point we either timed out or the backend isn't running
      console.error('Failed to fetch sensor types... Is the backend running??\n', e)
    }
})

function submit() {
  const name = displayName.value.trim()

  if (!name) 
    return
  
  const pin = showPinField.value ? pinNumber.value : null
  emit('add', { name, connection: selectedConnection.value, driver: selectedDriver.value, pin })
}

function onKeydown(e) {
  if (e.key === 'Enter') 
    submit()
  
  if (e.key === 'Escape') 
    emit('close')
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
          <option v-for="s in availableTypes" :key="s" :value="s">{{ s.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) }}</option>
        </select>
      </div>

      <div v-if="showPinField" class="modal-row">
        <label class="modal-label">Pin #:</label>
        <input
          class="modal-input"
          type="number"
          v-model.number="pinNumber"
          min="1"
          placeholder="Physical pin number (e.g. 18)"
        />
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
