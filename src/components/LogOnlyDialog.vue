<script setup>
  import { ref, computed, inject } from 'vue'
  import { ITEM_TYPES, DRIVERS } from '../constants/devices.js'

  
  /////////////////////////////////////////////
  // Define variables.
  const notes = ref('')
  const selectedIds = ref(new Set())

  // Getting other information that we need in this page.
  const currentUser = inject('currentUser')
  const layoutItems = inject('layoutItems')

  // define emits:
  const emit = defineEmits(['confirm', 'cancel'])


  /////////////////////////////////////////////
  // Define computed properties.

  // All sensors that are placed in the device layout page.
  const sensorList = computed(() => {
    if (!layoutItems?.value) 
      return []
    
    return layoutItems.value.filter(i => i.type === ITEM_TYPES.Sensor)
  })

  const startedBy = computed(() => {
    if (!currentUser?.value) 
      return 'Unknown'
    
    return `${currentUser.value.username} (${currentUser.value.role})`
  })

  const allSelected = computed(() => {
    if (sensorList.value.length === 0) 
      return false

    return sensorList.value.every(s => selectedIds.value.has(s.id))
  })

  const canSubmit = computed(() => selectedIds.value.size > 0)


  /////////////////////////////////////////////
  // Defining all functions now.
  function toggleSensor(id) {
    const s = new Set(selectedIds.value)
    if (s.has(id)) 
      s.delete(id)
    else 
      s.add(id)

    selectedIds.value = s
  }

  function selectAll() {
    selectedIds.value = new Set(sensorList.value.map(s => s.id))
  }

  function clearAll() {
    selectedIds.value = new Set()
  }

  // Send the selected sensors to log, and other info like notes and who started the logging to the parent.
  function submit() {
    if (!canSubmit.value) 
      return
    
    // Get the sensors that were selected and only take a subset of the full list. We don't need to send all the information back 
    // do the parent as it's not needed for anything that we are doing.
    const selectedSensors = sensorList.value.filter(s => selectedIds.value.has(s.id))
      .map(s => ({
        id: s.id,
        name: s.name,
        driver: s.driver ?? '',
        connection: s.connection  ?? '',
        unit: s.unit ?? '',
      }))

    emit('confirm', {
      startedBy: startedBy.value,
      notes: notes.value,
      selectedSensors,
    })
  }

  // Map the keys to do a few of the basic things that people would expect them to. At least it's what I would expect people to do on habit.
  function onKeydown(e) {
    if (e.key == 'Enter' && e.ctrlKey) 
      submit()
    if (e.key == 'Escape') 
      emit('cancel')
  }

  // Make the display of the drivers to be better, ie cap R and C. More correct, I guess not needed, but looks better.
  function driverLabel(driver) {
    if (!driver) 
      return '—'
    if (driver === DRIVERS.Relay)
      return 'Relay'
    if (driver === DRIVERS.CollisionDetector) 
      return 'Collision'

    return driver
  }
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('cancel')" @keydown="onKeydown" tabindex="0">
    <div class="dialog-box log-only-dialog">

      <h3 class="dialog-title">Log Only</h3>

      <!-- Started By (read-only) -->
      <div class="dialog-row">
        <label class="dialog-label">Started By:</label>
        <input class="dialog-input" :value="startedBy" readonly />
      </div>

      <!-- Notes -->
      <div class="dialog-row log-only-notes-row">
        <label class="dialog-label">Notes:</label>
        <textarea
          class="dialog-input log-only-textarea"
          v-model="notes"
          rows="2"
          placeholder="Optional notes…"
        />
      </div>

      <!-- Sensor select area -->
      <div class="log-only-section">

        <div class="log-only-section-header">
          <span class="section-label">Sensors to Log</span>
          <span v-if="sensorList.length > 0" class="log-only-section-actions">
            <button class="link-btn" @click="selectAll" :disabled="allSelected">Select All</button>
            <span class="link-sep">·</span>
            <button class="link-btn" @click="clearAll" :disabled="selectedIds.size === 0">Clear</button>
          </span>
        </div>

        <div v-if="sensorList.length === 0" class="sensor-empty">
          No sensors in the device layout... Add sensors in Device Layout to have a selection of sensors to start logging.
        </div>

        <div v-else class="sensor-list">
          <!-- For the class here in the label, we are looping through all the sensors that have been selected. 
          This will apply the rows that are selected to be blue. -->
          <label v-for="s in sensorList" :key="s.id" class="sensor-row" :class="{ 'sensor-row-checked': selectedIds.has(s.id) }">
            
            <!-- When the checkbox is checked then we trigger the toggle sensor function, that will cause the label class to update
            the row to turn blue. -->
            <input type="checkbox" :checked="selectedIds.has(s.id)" @change="toggleSensor(s.id)"/>
            <span class="sensor-name">{{ s.name }}</span>
            <span class="sensor-badge driver-badge">{{ driverLabel(s.driver) }}</span>
            <span class="sensor-badge conn-badge">{{ s.connection || '—' }}</span>
          </label>
        </div>

        <div v-if="sensorList.length > 0" class="sensor-count">
          {{ selectedIds.size }} of {{ sensorList.length }} selected
        </div>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">Start Logging</button>
        <button class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
  .log-only-dialog {
    width: 480px;
    max-height: 82vh;
    overflow-y: auto;
  }

  .log-only-notes-row {
    align-items: flex-start;
  }

  .log-only-textarea {
    resize: vertical;
    min-height: 48px;
    font-family: inherit;
    font-size: 13px;
  }

  /* Sensor section  */
  .log-only-section { 
    margin: 10px 0 6px; 
  }

  .log-only-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .log-only-section-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .link-btn:disabled {
    color: var(--text-secondary);
    text-decoration: none;
    cursor: default;
  }

  .link-sep { 
    font-size: 11px; color: var(--text-secondary); 
  }

  /* Scrollable sensor list */
  .sensor-list {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    max-height: 210px;
    overflow-y: auto;
  }

  .sensor-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color);
    font-size: 13px;
    color: var(--text-primary);
    transition: background 0.1s;
  }
  .sensor-row:last-child { 
    border-bottom: none; 
  }
  .sensor-row:hover { 
    background: var(--bg-ribbon-btn-hover); 
  }
  .sensor-row-checked {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .sensor-name { 
    flex: 1; font-weight: 500; 
  }

  .sensor-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
    white-space: nowrap;
  }
  .driver-badge {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }
  .conn-badge {
    background: color-mix(in srgb, var(--color-grey) 12%, transparent);
    color: var(--text-secondary);
  }

  .sensor-empty {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 12px 4px;
    font-style: italic;
  }

  .sensor-count {
    margin-top: 5px;
    font-size: 11px;
    color: var(--text-secondary);
    text-align: right;
  }
</style>
