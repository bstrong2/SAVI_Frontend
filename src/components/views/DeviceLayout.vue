<script setup>
  import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
  import AddSensorDialog from '../AddSensorDialog.vue'
  import { PERMISSIONS, canAccess } from '../../auth/roles.js'
  import { DRIVERS, DEVICE_TYPES, DEVICE_PROPS, DRIVER_DEFAULTS } from '../../constants/devices.js'
  import { LOG_LEVELS } from '../../constants/logLevels.js'


  /////////////////////////////////////////////
  // Define variables.
  const isEditMode = ref(false)
  const showAddMenu = ref(false)
  const showAddSensorDialog = ref(false)
  const showColorPicker = ref(false)
  const showTextColorPicker = ref(false)
  const selectedId = ref(null)
  const reconnecting = ref(false)
  const wrapperRef = ref(null)
  const canvasMinW = ref(0)
  const canvasMinH = ref(0)
  const originalColor = ref(null)
  const originalTextColor = ref(null)

  // injecting things that we need for this dialog.
  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const currentUser = inject('currentUser')
  const addLog = inject('addLog', () => {})
  const items = inject('layoutItems')
  const devices = inject('devices', ref([]))
  const runState = inject('runState', ref('idle'))
  const runInfo = inject('runInfo',  ref(null))

  let nextId = 1

  // Track whether a mousedown started inside the toolbar so a drag that ends
  // anywhere doesn't accidentally clear the selection.
  // Reset is deferred via setTimeout so the click event fires first.
  let mouseDownInToolbar = false
  const resetToolbarFlag = () => setTimeout(() => { mouseDownInToolbar = false }, 0)

  const PRESET_COLORS = [
    '#1e90ff', '#00bcd4', '#009688',
    '#4caf50', '#8bc34a', '#ffeb3b', '#ff9800',
    '#f44336', '#e91e63', '#9c27b0', '#673ab7',
    '#795548', '#607d8b', '#9e9e9e', '#ffffff',
    '#000000',
  ]

  /////////////////////////////////////////////
  // Define computed properties.
  const canOperate = computed(() => canAccess(currentUser?.value, PERMISSIONS.OperatorOnly))
  const isRunning = computed(() => runState.value === 'running' || runState.value === 'paused')
  const selectedItem = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
  const selectedIsRect = computed(() => selectedItem.value?.type === 'rect')
  const selectedIsSensor = computed(() => selectedItem.value?.type === 'sensor')
  const selectedHasColor = computed(() => selectedIsRect.value || selectedIsSensor.value)

  const canvasStyle = computed(() => {
    const PAD = 40
    let maxX = canvasMinW.value
    let maxY = canvasMinH.value
    for (const item of items.value) {
      maxX = Math.max(maxX, item.x + (item.w ?? 120) + PAD)
      maxY = Math.max(maxY, item.y + (item.h ?? 60)  + PAD)
    }
    return {
      width: maxX + 'px', height: maxY + 'px'
    }
  })

  /////////////////////////////////////////////
  // Mounts
  onMounted(() => {
    loadLayout()
    window.addEventListener('mouseup', resetToolbarFlag)
    window.addEventListener('keydown', onKeyDown)
  })
  onUnmounted(() => {
    window.removeEventListener('mouseup', resetToolbarFlag)
    window.removeEventListener('keydown', onKeyDown)
  })


  /////////////////////////////////////////////
  // Defining all functions.
  function isRecipeRelay(item) {
    return isRunning.value && runInfo.value?.doSensorId === item.id
  }

  function onKeyDown(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && isEditMode.value && selectedId.value !== null) {
      const tag = document.activeElement?.tagName

      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
        return

      deleteSelected()
    }
  }

  async function loadLayout() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/layout`)
      if (!response.ok) {
        addLog(`Layout load failed (HTTP ${response.status})`, LOG_LEVELS.Warning)
        return
      }
      
      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        items.value = data
        nextId = Math.max(...data.map(i => i.id), 0) + 1

        // Register all sensors with the backend so the canvas to DB ID mapping is
        // set. That way we can update the sensors with the correct values.
        for (const item of items.value.filter(i => i.type === 'sensor')) {
          if (item.connection === DRIVERS.Simulated)
            await registerSimulatedSensor(item)
          else
            await registerRealSensor(item)
        }
      }
    } catch (e) {
      addLog(`Layout load failed. Is the backend running?\n ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  // Register a simulated sensor in the backend SensorSimulationService.
  // On success, syncs state from the backend's value.
  async function registerSimulatedSensor(item) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/simulate/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId: item.id, name: item.name, driver: item.driver }),
      })
      if (!response.ok) {
        addLog(`Simulated sensor registration failed for "${item.name}" (HTTP ${response.status})`, LOG_LEVELS.Warning)
        return
      }

      const data = await response.json()
      if (item.driver === DRIVERS.Relay)
        item.relayState = data.state 

      if (item.driver === DRIVERS.CollisionDetector)
        item.value = data.stateLabel
    } catch (e) {
      addLog(`Simulated sensor registration failed for "${item.name}": ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  // Register a non-simulated sensor
  async function registerRealSensor(item) {
    try {
      await fetch(`${BACKEND_URL}/api/sensors/register-canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId: item.id, name: item.name, driver: item.driver }),
      })
    } catch (e) {
      addLog(`Sensor registration failed for "${item.name}": ${e.message}`, LOG_LEVELS.Warning)
    }

    // For collision detectors, also tell the Pi to start monitoring the GPIO pin.
    // I hope I can get rid of this, I need to ponder on how the PI is setup to avoid another call.
    if (item.driver === DRIVERS.CollisionDetector && item.pin != null) {
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId !== null) {
        try {
          await fetch(`${BACKEND_URL}/api/devices/${deviceId}/di/monitor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: item.pin, canvasId: item.id }),
          })
        } catch (e) {
          addLog(`DI monitor setup failed for "${item.name}": ${e.message}`, LOG_LEVELS.Warning)
        }
      }
    }
  }

  async function saveLayout() {
    if (!authToken?.value) 
      return
    try {
      const response = await fetch(`${BACKEND_URL}/api/layout`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken.value}`,
        },
        body: JSON.stringify(items.value),
      })
      if (!response.ok) 
        addLog(`Layout save failed (HTTP ${response.status})`, LOG_LEVELS.Warning)

    } catch (e) {
      addLog(`Layout save failed: ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  // Auto change the color of the text when the rectangle color is changed. Try to get the text to be readable.
  function rectTextColor(hex) {
    if (!hex) 
      return '#fff'

    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff'
  }

  function selectRect(item, e) {
    e.stopPropagation()
    if (isEditMode.value)
      selectedId.value = item.id
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
    showAddSensorDialog.value = true
  }

  async function confirmAddSensor({ name, connection, driver, pin }) {
    const id = nextId++
    const driverDefaults = DRIVER_DEFAULTS[driver] ?? { value: '--', unit: '' }
    const newItem = {
      id, 
      type: 'sensor', 
      name, 
      connection, 
      driver,
      pin: pin ?? null, 
      x: 80, 
      y: 80,
      color: '#1e90ff', 
      textColor: null,
      ...driverDefaults,
    }
    items.value.push(newItem)
    showAddSensorDialog.value = false
    isEditMode.value = true
    saveLayout()

    // Register the new sensor immediately so the backend DB mapping is ready
    if (connection === DRIVERS.Simulated) 
      await registerSimulatedSensor(newItem)
    else
      await registerRealSensor(newItem)
  }

  function addRectangle() {
    const id = nextId++
    items.value.push({
      id, type: 'rect', 
      name: 'New Zone',
      x: 80, 
      y: 80, 
      w: 200, 
      h: 150,
      color: '#1e90ff', 
      textColor: null, 
      fontSize: 16, 
      fontWeight: 'normal', 
      textAlign: 'left',
    })
    showAddMenu.value = false
    isEditMode.value = true
    saveLayout()
  }

  function deleteSelected() {
    if (selectedId.value !== null) {
      items.value = items.value.filter(s => s.id !== selectedId.value)
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
    if (selectedItem.value) 
      selectedItem.value.textAlign = align
  }

  // limiting the font size.
  function clampFontSize(val) {
    return Math.max(8, Math.min(72, Number(val) || 13))
  }

  // Drag to move, this is the logic for moving things on the screen.
  function startDrag(item, e) {
    if (!isEditMode.value) 
      return

    // We don't want the browser to highlight text accidentally. We just want to move the object.
    e.preventDefault()


    selectedId.value = item.id

    // Get the selected objects div data. (DOM Object)
    const wrapper = wrapperRef.value

    // Getting Bottom, Height, Left, right, top, width, x and y for the selected object.
    const r0 = wrapper.getBoundingClientRect()

    // Get where the user clicked on the object.
    const offsetX = (e.clientX - r0.left + wrapper.scrollLeft) - item.x

    // Get where the user clicked on the object.
    const offsetY = (e.clientY - r0.top  + wrapper.scrollTop)  - item.y

    // Pin canvas size so dragging up/left can't shrink it and clamp scrollTop mid-drag
    canvasMinW.value = parseInt(canvasStyle.value.width)  || 0
    canvasMinH.value = parseInt(canvasStyle.value.height) || 0

    const EDGE = 40, SPEED = 4

    // Get the position of the x y position of the mouse.
    let mx = e.clientX, my = e.clientY, rafId

    const frame = () => {
      const rx = mx - r0.left
      const ry = my - r0.top

      // If our mouse x location is at the edge, then start scrolling in that moving direction.
      if (rx < EDGE)
        wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - SPEED)
      else if (rx > r0.width  - EDGE)
        wrapper.scrollLeft += SPEED
      
      // If our mouse y location is at the edge, then start scrolling in that moving direction.
      if (ry < EDGE)
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop  - SPEED)
      else if (ry > r0.height - EDGE)
        wrapper.scrollTop += SPEED

      // Clamp to wrapper min edges so mouse exiting above/left doesn't snap item to 0
      // const cx = Math.max(r0.left, mx)
      // const cy = Math.max(r0.top,  my)
      // item.x = Math.max(0, cx - r0.left + wrapper.scrollLeft - offsetX)
      // item.y = Math.max(0, cy - r0.top  + wrapper.scrollTop  - offsetY)

      // Set the location of the selected item to be moving with the mouse.
      item.x = Math.max(0, mx - r0.left + wrapper.scrollLeft - offsetX)
      item.y = Math.max(0, my - r0.top  + wrapper.scrollTop  - offsetY)

      // Keep looking through this until the user lets go of left click.
      rafId = requestAnimationFrame(frame)
    }

    // On mouse move update the mx and my variables so the object will actually move.
    const onMove = ev => { 
      mx = ev.clientX; 
      my = ev.clientY 
    }

    // stuff to do when the move have finished.
    const onUp = () => {
      cancelAnimationFrame(rafId)
      canvasMinW.value = 0
      canvasMinH.value = 0
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      // After we are done moving save the layout in the back end so if someone refreshes the page the move will have been saved.
      saveLayout()
    }

    // Kick off the first frame request and then add the event listeners.
    rafId = requestAnimationFrame(frame)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Resize 
  function startResize(item, e) {
    e.preventDefault()
    e.stopPropagation()

    // Store the start values and item dimensions as we aren't moving the object, so we want a start position to anchor it.
    const x = e.clientX 
    const y = e.clientY
    const w = item.w
    const h = item.h
    
    // Expand the rectangle :).
    const move = ev => { 
      item.w = Math.max(100, w + ev.clientX - x)
      item.h = Math.max(50, h + ev.clientY - y) 
    }
    const up = () => { 
      window.removeEventListener('mousemove', move); 
      window.removeEventListener('mouseup', up); saveLayout() 
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function pickColor(color) {
    if (selectedItem.value && selectedHasColor.value) 
      selectedItem.value.color = color
  }

  function confirmColor() {
    originalColor.value = null
    showColorPicker.value = false
  }

  function closeColorPicker() {
    if (originalColor.value && selectedItem.value && selectedHasColor.value)
      selectedItem.value.color = originalColor.value

    originalColor.value = null
    showColorPicker.value = false
  }

  function openColorPicker() {
    originalColor.value = selectedItem.value?.color ?? null
    showColorPicker.value = true
  }

  function openTextColorPicker() {
    originalTextColor.value = selectedItem.value?.textColor ?? null
    showTextColorPicker.value = true
    showColorPicker.value = false
  }

  function pickTextColor(color) {
    if (selectedItem.value && selectedHasColor.value) 
      selectedItem.value.textColor = color
  }

  function confirmTextColor() {
    originalTextColor.value = null
    showTextColorPicker.value = false
  }

  // revert defaults to false — clicking away confirms the pick, Cancel explicitly passes true
  function closeTextColorPicker(revert = false) {
    if (revert && selectedItem.value && selectedHasColor.value)
      selectedItem.value.textColor = originalTextColor.value

    originalTextColor.value = null
    showTextColorPicker.value = false
  }

  function resetTextColorToAuto() {
    if (selectedItem.value) 
      selectedItem.value.textColor = null
    originalTextColor.value = null
    showTextColorPicker.value = false
  }

  // Reconnect All Devices — restarts the Pi FastAPI on every connected IP device,
  // then restarts the C# backend (which auto-restarts when running as a Windows service).
  async function reconnectAllDevices() {
    reconnecting.value = true
    addLog('Reconnect All: restarting Pi agent(s)…', LOG_LEVELS.Info)

    const ipDevices = (devices.value ?? []).filter(d => d.type === DEVICE_TYPES.Ip)
    for (const d of ipDevices) {
      const ip = d.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()
      const port = d.properties.find(p => p.name === DEVICE_PROPS.PortNumber)?.value
      
      if (!ip || !port) 
        continue

      try {
        await fetch(`http://${ip}:${port}/restart`, { method: 'POST' })
        addLog(`Reconnect All: restart sent to Pi at ${ip}:${port}`, LOG_LEVELS.Info)
      } catch {
        addLog(`Reconnect All: could not reach Pi at ${ip}:${port}`, LOG_LEVELS.Warning)
      }
    }

    addLog('Reconnect All: restarting C# backend…', LOG_LEVELS.Info)
    try {
      await fetch(`${BACKEND_URL}/api/admin/restart`, {
        method: 'POST',
        headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      })
    } catch (e) { 
      addLog(`Error trying to restart the backend... ${e}`, LOG_LEVELS.Error)
     }

    // Set a timeout for the backend restarting.
    setTimeout(() => { reconnecting.value = false }, 8000)
  }


  function resolveDeviceId(connection) {
    if (!connection || connection === DRIVERS.Simulated) 
      return null
    for (const d of devices.value) {
      if (d.type === DEVICE_TYPES.Ip) {
        const ip = d.properties.find(p => p.name === DEVICE_PROPS.IpAddress)?.value?.trim()
        if (ip === connection) 
          return d.id
      }
    }
    return null
  }

  async function handleRelayChange(item, state) {

    // Show to the user that the relay was successful... SignalR will update it if it wasn't a success.
    item.relayState = state

    // Check to see if we are interacting with a simulated device or a real hardware device.
    if (item.connection === DRIVERS.Simulated) {
      try {
        await fetch(`${BACKEND_URL}/api/simulate/relay/${item.id}/${state}`, {
          method: 'POST',
          headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
        })
      } catch (e) {
        addLog(`Simulated relay command failed: ${e.message}`, LOG_LEVELS.Warning)
      }
    } else {
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId !== null) {
        if (item.pin == null) {
          addLog(`Relay "${item.name}" has no pin configured. Please delete and re-add the relay with an assosiated pin this time.`, 
          LOG_LEVELS.Warning)
        } else {

          try {
            await fetch(`${BACKEND_URL}/api/devices/${deviceId}/do`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: item.pin, state: state === 'on', canvasId: item.id }),
            })

          } catch (e) {
            addLog(`Relay command failed: ${e.message}`, LOG_LEVELS.Warning)
          }
        }
      }
    }
    addLog(`"${item.name}" turned ${state.toUpperCase()} by ${currentUser?.value?.username}`, LOG_LEVELS.Info)
  }

  // Simulated collision detector toggle — calls backend to keep state authoritative there
  async function toggleCollisionSim(item) {

    const nowTriggered = item.value !== 'Collision!'
    const endpoint = nowTriggered ? 'trigger' : 'release'

    // Show to the user that the Collision Detector was successful... SignalR will update it if it wasn't a success.
    item.value = nowTriggered ? 'Collision!' : 'No Contact'

    try {
      await fetch(`${BACKEND_URL}/api/simulate/di/${item.id}/${endpoint}`, {
        method:  'POST',
        headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      })
    } catch (e) {
      addLog(`Simulated DI command failed: ${e.message}`, LOG_LEVELS.Warning)
    }
  }

  // Canvas click, deselect and closes menus, but not if the mouse is pressed down in the toolbar
  function onCanvasClick(e) {
    if (mouseDownInToolbar) {
      mouseDownInToolbar = false
      return
    }
    if (!e.target.closest('.dropdown-wrapper'))
      showAddMenu.value = false

    if (!e.target.closest('.color-picker-wrap'))
      closeColorPicker()

    if (!e.target.closest('.text-color-picker-wrap')) 
      closeTextColorPicker()

    if (!e.target.closest('.sensor-tile') && !e.target.closest('.rect-tile')) 
      selectedId.value = null
  }
</script>

<template>
  <div class="device-layout" @click="onCanvasClick">

    <div class="view-toolbar" @mousedown="mouseDownInToolbar = true">
      <!-- ── Non-edit mode ── -->
      <template v-if="!isEditMode">
        <button v-if="canOperate" class="toolbar-btn" @click.stop="startEdit"><font-awesome-icon icon="pen" style="color: #e6a817" /> Edit</button>
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
        <button v-if="selectedId !== null" class="toolbar-btn toolbar-btn-danger" @click="deleteSelected"><font-awesome-icon icon="trash" /> Delete</button>
        <button class="toolbar-btn active" @click="doneEdit"><font-awesome-icon icon="check" style="color: #4caf50" /> Done Editing</button>

        <!-- Background and text color pickers -->
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
                <button v-for="c in PRESET_COLORS" :key="c" class="color-swatch" :class="{ active: selectedItem.color === c }"
                  :style="{ background: c, borderColor: c === '#ffffff' ? '#ccc' : 'transparent' }"
                  @click="pickColor(c)"/>
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
                <button v-for="c in PRESET_COLORS" :key="c" class="color-swatch" :class="{ active: selectedItem.textColor === c }"
                  :style="{ background: c, borderColor: c === '#ffffff' ? '#ccc' : 'transparent' }"
                  @click="pickTextColor(c)"/>
              </div>
              <div class="color-picker-footer">
                <button class="btn btn-primary" style="font-size:12px;padding:4px 14px" @click="confirmTextColor">OK</button>
                <button class="toolbar-btn" style="font-size:12px" @click="resetTextColorToAuto">Auto</button>
                <button class="toolbar-btn" style="font-size:12px" @click="closeTextColorPicker()">Cancel</button>
              </div>
            </div>
          </div>
        </template>

        <!-- Text formatting... rectangles only -->
        <template v-if="selectedIsRect">
          <div class="toolbar-sep" />

          <input type="text" class="toolbar-text-input" v-model="selectedItem.name" placeholder="Label" @click.stop/>

          <div class="toolbar-sep" />

          <!-- Bold -->
          <button class="toolbar-btn toolbar-bold-btn" :class="{ active: selectedItem.fontWeight === 'bold' }" title="Bold"
            @click.stop="toggleBold">B</button>

          <!-- Font size -->
          <input type="number" class="toolbar-fontsize-input" :value="selectedItem.fontSize" min="8" max="72"
            @change.stop="selectedItem.fontSize = clampFontSize($event.target.value)" @click.stop title="Font size"/>
          <div class="toolbar-sep" />

          <!-- Alignment -->
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'left' }" 
            title="Align left" @click.stop="setAlign('left')"><font-awesome-icon icon="align-left" style="color: var(--accent)" />
          </button>
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'center' }" 
            title="Center" @click.stop="setAlign('center')"><font-awesome-icon icon="align-center" style="color: var(--accent)" />
          </button>
          <button class="toolbar-btn toolbar-align-btn" :class="{ active: selectedItem.textAlign === 'right' }" 
            title="Align right" @click.stop="setAlign('right')" ><font-awesome-icon icon="align-right" style="color: var(--accent)" />
          </button>
        </template>
      </template>
    </div>

    <div class="device-canvas-wrapper" ref="wrapperRef">
      <div class="device-canvas" :style="canvasStyle">
        <template v-for="item in items" :key="item.id">

          <!-- Sensor tile -->
          <div v-if="item.type === 'sensor'" class="sensor-tile" :class="{ editable: isEditMode, selected: selectedId === item.id }"
            :style="{
              left: item.x + 'px',
              top: item.y + 'px',
              background: item.color || 'var(--bg-sensor-tile)',
            }"
            @mousedown="startDrag(item, $event)"
            @click.stop="isEditMode && (selectedId = item.id)">
            <div class="sensor-tile-name" :style="{ color: item.textColor || null }">{{ item.name }}</div>

            <!-- Relay: ON / OFF radio buttons -->
            <template v-if="item.driver === DRIVERS.Relay">
              <div class="relay-controls" @mousedown.stop @click.stop>
                <label class="relay-label" :class="{ 'relay-disabled': !canOperate || isRecipeRelay(item) }"
                :style="{ color: item.textColor || null }">
                  <input type="radio" :name="'relay-' + item.id" value="on" :checked="item.relayState === 'on'" 
                  :disabled="!canOperate || isRecipeRelay(item)" @change="handleRelayChange(item, 'on')"/> ON
                </label>
                
                <label class="relay-label" :class="{ 'relay-disabled': !canOperate || isRecipeRelay(item) }" :style="{ color: item.textColor || null }">
                  <input type="radio" :name="'relay-' + item.id" value="off" :checked="item.relayState !== 'on'" :disabled="!canOperate || isRecipeRelay(item)"
                    @change="handleRelayChange(item, 'off')"/> 
                    OFF
                </label>
              </div>
              <div v-if="item.connection === DRIVERS.Simulated" class="sim-badge">SIM</div>
            </template>

            <!-- Collision Detector -->
            <template v-else-if="item.driver === DRIVERS.CollisionDetector">
              <div class="collision-state" :style="{ color: item.textColor || (item.value === 'Collision!' ? '#ff5252' : '#69f0ae')}">
                <span class="collision-dot" />
                {{ item.value ?? 'No Contact' }}
              </div>

              <!-- Simulate trigger/release — only for Simulated connection + operators -->
              <button
                v-if="item.connection === DRIVERS.Simulated && canOperate" class="sim-trigger-btn"
                :class="{ 'sim-trigger-btn--active': item.value === 'Collision!' }" @mousedown.stop @click.stop="toggleCollisionSim(item)">
                {{ item.value === 'Collision!' ? 'Release' : 'Trigger' }}
              </button>
              <div v-if="item.connection === DRIVERS.Simulated" class="sim-badge">SIM</div>
            </template>

            <!-- Default sensors: live value + unit -->
            <template v-else>
              <div class="sensor-tile-value" :style="{ color: item.textColor || null }">{{ item.value }}</div>
              <div class="sensor-tile-unit"  :style="{ color: item.textColor || null }">{{ item.unit }}</div>
            </template>
          </div>

          <!-- Rectangle tile -->
          <div v-else-if="item.type === 'rect'" class="rect-tile" :class="{ editable: isEditMode, selected: selectedId === item.id }"
            :style="{
              left: item.x + 'px', top: item.y + 'px',
              width: item.w + 'px', height: item.h + 'px',
              background: item.color,
              color: rectTextColor(item.color),
            }"
            @mousedown="startDrag(item, $event)"
            @click="selectRect(item, $event)">
            <span class="rect-tile-name" 
              :style="{
                fontSize: item.fontSize + 'px',
                fontWeight: item.fontWeight,
                textAlign: item.textAlign,
                color: item.textColor || rectTextColor(item.color),
              }">
              {{ item.name }}</span>

            <button v-if="isEditMode" class="rect-resize-grip" :style="{ color: rectTextColor(item.color) }" @mousedown.stop="startResize(item, $event)">
              ◢
            </button>
          </div>

        </template>
      </div>
    </div>

    <AddSensorDialog v-if="showAddSensorDialog" @add="confirmAddSensor" @close="showAddSensorDialog = false"/>

    <button v-if="canOperate" class="reconnect-all-btn" :disabled="reconnecting" @click.stop="reconnectAllDevices">
      <font-awesome-icon icon="rotate-right" style="color: var(--accent)"/> {{ reconnecting ? 'Reconnecting…' : 'Reconnect All Devices' }}
    </button>
  </div>
</template>

<style scoped>
  .rect-tile {
     z-index: 1; 
    }
  .sensor-tile { 
    z-index: 2; 
  }
  .sensor-tile.selected { 
    outline: 2px solid var(--accent); 
  }
  .rect-tile.selected { 
    outline: 3px solid #fff; boffsetX-shadow: 0 0 0 1px rgba(0,0,0,0.4); 
  }

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
    boffsetX-shadow: 0 2px 6px rgba(0,0,0,0.12);
  }
  .reconnect-all-btn:hover { 
    background: var(--bg-ribbon-btn-hover); 
  }

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
  .sim-trigger-btn:hover {
     background: rgba(255, 255, 255, 0.20); 
    }
  .sim-trigger-btn--active {
     border-color: rgba(255, 82, 82, 0.60); 
    }
  .sim-trigger-btn--active:hover {
     background: rgba(255, 82, 82, 0.18); 
    }

  .sim-badge {
    margin-top: 5px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
  }

  .device-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .device-canvas-wrapper {
    flex: 1;
    overflow: auto;
    position: relative;
    background: var(--bg-canvas);
  }

  .device-canvas {
    position: relative;
    min-width: 100%;
    min-height: 100%;
  }

  .sensor-tile {
    position: absolute;
    width: 120px;
    min-height: 60px;
    background: var(--bg-sensor-tile);
    border: 1px solid var(--sensor-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: default;
  }

  .sensor-tile.editable { 
    cursor: move; border-color: var(--accent); 
  }

  .sensor-tile-name {
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    text-align: center;
  }

  .sensor-tile-value { 
    color: var(--accent); font-size: 15px; font-weight: 700; margin-top: 4px; 
  }

  .sensor-tile-unit  { 
    font-size: 10px; color: var(--text-secondary); 
  }

  .rect-tile {
    position: absolute;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 3px;
    cursor: default;
    overflow: hidden;
    min-width: 100px;
    min-height: 50px;
  }

  .rect-tile.editable { 
    cursor: move; 
  }

  .rect-tile-name {
    display: block;
    padding: 6px 8px 4px;
    font-size: 13px;
    font-weight: 600;
  }

  .rect-resize-grip {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    padding: 0;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
    cursor: se-resize;
    opacity: 0.6;
  }
  .rect-resize-grip:hover { 
    opacity: 1; 
  }

  .color-picker-wrap,
  .text-color-picker-wrap {
    position: relative; 
  }

  .color-preview-btn { 
    display: flex; align-items: center; gap: 6px; 
  }

  .color-preview-dot {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0,0,0,0.2);
    flex-shrink: 0;
  }

  .color-picker-popup {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    boffsetX-shadow: 0 4px 16px rgba(0,0,0,0.18);
    padding: 12px;
    z-index: 200;
  }

  .color-swatches {
    display: grid;
    grid-template-columns: repeat(8, 28px);
    gap: 5px;
    margin-bottom: 10px;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .color-swatch:hover  { 
    transform: scale(1.15); border-color: rgba(0,0,0,0.25); 
  }

  .color-swatch.active { 
    border-color: var(--accent); boffsetX-shadow: 0 0 0 2px var(--accent); 
  }

  .color-picker-footer {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .dropdown-wrapper { 
    position: relative; 
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    boffsetX-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 100;
    min-width: 120px;
  }

  .dropdown-menu button {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 7px 14px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;
  }
  .dropdown-menu button:hover { 
    background: var(--bg-ribbon-btn-hover); 
  }

  .toolbar-text-input {
    height: 26px;
    width: 130px;
    padding: 2px 6px;
    font-size: 12px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .toolbar-fontsize-input {
    height: 26px;
    width: 52px;
    padding: 2px 4px;
    font-size: 12px;
    text-align: center;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .toolbar-bold-btn {
    font-weight: 800;
    font-size: 14px;
    min-width: 28px;
    font-family: serif;
  }

  .toolbar-align-btn {
    min-width: 28px;
    font-size: 13px;
  }

  .toolbar-btn-danger {
    color: #f44336;
    border-color: #f44336;
  }
  .toolbar-btn-danger:hover {
    background: #f44336;
    color: #fff;
  }

  .toolbar-sep {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 4px;
  }
</style>
