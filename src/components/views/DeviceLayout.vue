<script setup>
  import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
  import AddSensorDialog from '../AddSensorDialog.vue'
  import SensorTile from '../SensorTile.vue'
  import RectTile from '../RectTile.vue'
  import ColorPickerPopup from '../ColorPickerPopup.vue'
  import { PERMISSIONS, canAccess } from '../../auth/roles.js'
  import { ITEM_TYPES, DRIVERS, DEVICE_TYPES, DEVICE_PROPS, DRIVER_DEFAULTS } from '../../constants/devices.js'
  import { COLORS } from '../../constants/colors.js'
  import { LOG_LEVELS } from '../../constants/enums.js'
  import { PICKER_TYPES } from '../../constants/devices.js'


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
  const originalTextColor = ref(null)
  const maxFontSize = 72
  const minFontSize = 8

  // injecting things that we need for this dialog.
  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const currentUser = inject('currentUser')
  const addLog = inject('addLog', () => {})
  const items = inject('layoutItems')
  const devices = inject('devices', ref([]))

  let nextId = 1

  // Track whether a mousedown started inside the toolbar so a drag that ends
  // anywhere doesn't accidentally clear the selection.
  // Reset is deferred via setTimeout so the click event fires first.
  let mouseDownInToolbar = false
  const resetToolbarFlag = () => setTimeout(() => { mouseDownInToolbar = false }, 0)

  const PRESET_COLORS = [
    COLORS.dodgerBlue, COLORS.lightCyan, COLORS.teal, COLORS.green, COLORS.limeGreen, COLORS.yellow, COLORS.orange,
    COLORS.red, COLORS.pink, COLORS.deepPurple, COLORS.indigo, COLORS.brown, COLORS.blueGrey, COLORS.grey, COLORS.white, COLORS.black,
  ]

  /////////////////////////////////////////////
  // Define computed properties.
  const canOperate = computed(() => canAccess(currentUser?.value, PERMISSIONS.OperatorOnly))
  const selectedItem = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)

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
        for (const item of items.value.filter(i => i.type === ITEM_TYPES.Sensor)) {
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

  // Basically save the device layout to the backend so on page reload, or first boot we have the same layout that was last used.
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

  function selectRect(item, e) {
    e.stopPropagation()
    if (isEditMode.value)
      selectedId.value = item.id
  }

  function startEdit() {
    isEditMode.value = true
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
      type: ITEM_TYPES.Sensor,
      name, 
      connection, 
      driver,
      pin: pin ?? null, 
      x: 80, 
      y: 80,
      color: COLORS.dodgerBlue,
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
      id, type: ITEM_TYPES.Rect,
      name: 'New Rectangle',
      x: 80, 
      y: 80, 
      w: 200, 
      h: 150,
      color: COLORS.dodgerBlue,
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

  function toggleBold() {
    if (selectedItem.value)
      selectedItem.value.fontWeight = selectedItem.value.fontWeight === 'bold' ? 'normal' : 'bold'
  }

  function setAlign(align) {
    if (selectedItem.value) 
      selectedItem.value.textAlign = align
  }

  // Limit the font size, we don't want MASSIVE fonts. We have this function, because the user can type in a value.
  // If they do that and don't use the spinboxes then it will allow the higher numbers.
  function clampFontSize(val) {
    return Math.max(minFontSize, Math.min(maxFontSize, Number(val)))
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

    // Pin canvas size so dragging up/left can't shrink it
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
    if (selectedItem.value)
      selectedItem.value.color = color
  }

  function confirmColor() {
    showColorPicker.value = false
  }

  function closeColorPicker() {
    showColorPicker.value = false
  }

  function openTextColorPicker() {
    originalTextColor.value = selectedItem.value?.textColor ?? null
    showTextColorPicker.value = true
    showColorPicker.value = false
  }

  function pickTextColor(color) {
    if (selectedItem.value)
      selectedItem.value.textColor = color
  }

  function confirmTextColor() {
    originalTextColor.value = null
    showTextColorPicker.value = false
  }

  // revert defaults to false — clicking away confirms the pick, Cancel explicitly passes true
  function closeTextColorPicker(revert = false) {
    if (revert && selectedItem.value)
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


  // Canvas click, deselect and closes menus, but not if the mouse is pressed down in the toolbar
  function onCanvasClick(e) {
    if (mouseDownInToolbar) {
      mouseDownInToolbar = false
      return
    }
    if (!e.target.closest('.dropdown-wrapper'))
      showAddMenu.value = false

    if (!e.target.closest('.color-picker-wrap')) {
      closeColorPicker()
      closeTextColorPicker()
    }

    if (!e.target.closest('.sensor-tile') && !e.target.closest('.rect-tile')) 
      selectedId.value = null
  }
</script>

<template>

  <!-- Really all of this code is to set up the toolbar. -->
  <div class="device-layout" @click="onCanvasClick">

    <div class="view-toolbar" @mousedown="mouseDownInToolbar = true">
      <!-- ── Non-edit mode ── -->
      <template v-if="!isEditMode">
        <button v-if="canOperate" class="toolbar-btn" @click.stop="startEdit"><font-awesome-icon icon="pen" style="color: var(--color-gold)" /> Edit</button>
        <div v-if="canOperate" class="dropdown-wrapper">
          <button class="toolbar-btn" @click.stop="showAddMenu = !showAddMenu">+ Add ▾</button>
          <div v-if="showAddMenu" class="dropdown-menu">
            <button @click="addSensor">Add Device</button>
            <button @click="addRectangle">Rectangle</button>
          </div>
        </div>
      </template>

      <!-- ── Edit mode ── -->
      <template v-else>
        <button v-if="selectedId !== null" class="toolbar-btn toolbar-btn-danger" @click="deleteSelected"><font-awesome-icon icon="trash" /> Delete</button>
        <button class="toolbar-btn active" @click="doneEdit"><font-awesome-icon icon="check" style="color: var(--color-green)" /> Done Editing</button>

        <!-- Background and text color pickers, will only show up if the selected object. -->
        <template v-if="selectedItem">
          <div class="toolbar-sep" />

          <!-- Object that allows the user to change the background color of the selected object. -->
          <ColorPickerPopup
            :type="PICKER_TYPES.BackgroundColor"
            :show="showColorPicker"
            :colors="PRESET_COLORS"
            :model-value="selectedItem.color"
            :preview-style="{ background: selectedItem.color }"
            @toggle="showColorPicker = !showColorPicker; closeTextColorPicker()"
            @pick="pickColor"
            @confirm="confirmColor"
            @cancel="closeColorPicker"
          />

          <!-- Object that allows the user to change the text color of the selected object. -->
          <ColorPickerPopup
            :type="PICKER_TYPES.Text"
            :show="showTextColorPicker"
            :colors="PRESET_COLORS"
            :model-value="selectedItem.textColor"
            :preview-style="{ background: selectedItem.textColor ?? COLORS.white, border: selectedItem.textColor ? 'none' : `1px solid ${COLORS.grey}` }"
            @toggle="openTextColorPicker"
            @pick="pickTextColor"
            @confirm="confirmTextColor"
            @cancel="closeTextColorPicker()"
            @auto="resetTextColorToAuto"
          />
        </template>

        <!-- Text formatting... rectangles only -->
        <template v-if="selectedItem?.type === ITEM_TYPES.Rect">
          <div class="toolbar-sep" />

          <input type="text" class="toolbar-text-input" v-model="selectedItem.name" placeholder="Label" @click.stop/>

          <div class="toolbar-sep" />

          <!-- Bold -->
          <button class="toolbar-btn toolbar-bold-btn" :class="{ active: selectedItem.fontWeight === 'bold' }" title="Bold"
            @click.stop="toggleBold">B</button>

          <!-- Font size -->
          <input type="number" class="toolbar-fontsize-input" :value="selectedItem.fontSize" min="minFontSize" max="maxFontSize"
            @change.stop="selectedItem.fontSize = clampFontSize($event.target.value)" @click.stop title="Font size"/>
          <div class="toolbar-sep" />

          <!-- Alignment options for text.-->
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
          <SensorTile v-if="item.type === ITEM_TYPES.Sensor" :item="item" :is-edit-mode="isEditMode" :is-selected="selectedId === item.id"
            @drag-start="startDrag(item, $event)" @select="selectedId = item.id"
          />
          <RectTile v-else-if="item.type === ITEM_TYPES.Rect" :item="item" :is-edit-mode="isEditMode" :is-selected="selectedId === item.id"
            @drag-start="startDrag(item, $event)" @resize-start="startResize(item, $event)" @select="selectRect(item, $event)"
          />
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
  .reconnect-all-btn:hover { 
    background: var(--bg-ribbon-btn-hover); 
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
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
    color: var(--color-red);
    border-color: var(--color-red);
  }
  .toolbar-btn-danger:hover {
    background: var(--color-red);
    color: var(--color-white);
  }

  .toolbar-sep {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 4px;
  }
</style>
