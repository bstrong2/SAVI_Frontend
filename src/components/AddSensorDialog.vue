<script setup>
  import { ref, computed, watch, inject, onMounted } from 'vue'
  import { DRIVERS, DEVICE_TYPES, DEVICE_PROPS, SIMULATED_TYPES } from '../constants/devices.js'

  const emit = defineEmits(['add', 'close'])

  const BACKEND_URL = inject('BACKEND_URL')
  const devices = inject('devices')
  const addLog = inject('addLog', (msg, level) => console.error(msg))

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

    // If there is nothing in the list then return.
    if (!newAvailableTypes.length)
      return

    if (!newAvailableTypes.includes(selectedDriver.value)) {
      selectedDriver.value = newAvailableTypes[0]
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
        addLog(`Failed to fetch sensor types: ${e}`, 'Error')
      }
  })

  function submit() {
    const name = displayName.value.trim()

    if (!name) 
      return
    
    const pin = showPinField.value ? pinNumber.value : null
    emit('add', { name, connection: selectedConnection.value, driver: selectedDriver.value, pin })
  }

  // Map the keys to do a few of the basic things that people would expect them to. At least it's what I would expect people to do on habit.
  function onKeydown(e) {
    if (e.key === 'Enter') 
      submit()
    
    if (e.key === 'Escape') 
      emit('close')
  }
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-box add-sensor-dialog" @keydown="onKeydown">

      <div class="dialog-row">
        <label class="dialog-label">Display Name:</label>
        <input
          class="dialog-input"
          v-model="displayName"
          placeholder="e.g. Temperature 1"
          autofocus
        />
      </div>

      <div class="dialog-row">
        <label class="dialog-label">Connection:</label>
        <select class="dialog-input" v-model="selectedConnection">
          <option v-for="c in connections" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>

      <div class="dialog-row">
        <label class="dialog-label">Devices:</label>
        <select class="dialog-input" v-model="selectedDriver">
          <option v-for="s in availableTypes" :key="s" :value="s">{{ s.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) }}</option>
        </select>
      </div>

      <div v-if="showPinField" class="dialog-row">
        <label class="dialog-label">Pin #:</label>
        <input
          class="dialog-input"
          type="number"
          v-model.number="pinNumber"
          min="1"
          placeholder="Physical pin number (e.g. 18)"
        />
      </div>

      <div class="dialog-footer">
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
