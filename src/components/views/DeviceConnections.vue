<script setup>
  import { ref, onMounted, onUnmounted, nextTick } from 'vue'

  
  /////////////////////////////////////////////
  // Define variables.

  // Have hardcoded data so there is something there on first boot.
  const root = ref({
    expanded: true,
    children: [
      {
        id: 1, name: 'COM Device', type: 'com', expanded: false,
        properties: [
          { name: 'ComName',  value: 'COM1', description: 'COM port name (e.g., COM1)', propType: 'string', editing: false },
          { name: 'BaudRate', value: '9600', description: 'Baud rate for communication',  propType: 'int',    editing: false },
        ],
      },
      {
        id: 2, name: 'IP Device', type: 'ip', expanded: false,
        properties: [
          { name: 'IpAddress',  value: '192.168.1.100', description: 'IP address of the device',   propType: 'string', editing: false },
          { name: 'PortNumber', value: '502',            description: 'Port number for connection', propType: 'int',    editing: false },
        ],
      },
    ],
  })

  let nextId = 3

  // Context menu state.
  const ctx = ref({ visible: false, x: 0, y: 0, mode: null, target: null })

  /////////////////////////////////////////////
  // Mounts
  onMounted(()   => window.addEventListener('click', hideCtx))
  onUnmounted(() => window.removeEventListener('click', hideCtx))


  /////////////////////////////////////////////
  // Defining all functions.

  function hideCtx() { ctx.value.visible = false }

  function onRootRightClick(e) {
    e.preventDefault()
    e.stopPropagation()
    ctx.value = { visible: true, x: e.clientX, y: e.clientY, mode: 'category', target: null }
  }

  function onDeviceRightClick(e, device) {
    e.preventDefault()
    e.stopPropagation()
    ctx.value = { visible: true, x: e.clientX, y: e.clientY, mode: 'device', target: device }
  }

  function addDevice(type) {
    const id = nextId++
    root.value.children.push(
      type === 'com'
        ? {
            id, name: 'COM Device', type: 'com', expanded: true,
            properties: [
              { name: 'ComName',  value: '',     description: 'COM port name (e.g., COM1)',   propType: 'string', editing: false },
              { name: 'BaudRate', value: '9600', description: 'Baud rate for communication',  propType: 'int',    editing: false },
            ],
          }
        : {
            id, name: 'IP Device', type: 'ip', expanded: true,
            properties: [
              { name: 'IpAddress',  value: '',    description: 'IP address of the device',    propType: 'string', editing: false },
              { name: 'PortNumber', value: '502', description: 'Port number for connection',  propType: 'int',    editing: false },
            ],
          }
    )
    hideCtx()
  }

  function deleteDevice(device) {
    root.value.children = root.value.children.filter(d => d.id !== device.id)
    hideCtx()
  }

  // Close all other edits and open this one, then focus the input.
  function startEdit(prop) {
    root.value.children.forEach(d => d.properties.forEach(p => { p.editing = false }))
    prop.editing = true
    nextTick(() => {
      const el = document.querySelector('.prop-edit-active input, .prop-edit-active select')
      if (el) { el.focus(); el.select?.() }
    })
  }

  function commitEdit(prop) { prop.editing = false }

  function onEditKey(e, prop) {
    if (e.key === 'Enter' || e.key === 'Escape') commitEdit(prop)
  }

  function saveSettings() {
    const data = root.value.children.map(d => ({
      id: d.id, name: d.name, type: d.type,
      properties: d.properties.map(p => ({ name: p.name, value: p.value })),
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const downloadLink = document.createElement('a')
    downloadLink.href = url; downloadLink.download = 'device_connections.json'; downloadLink.click()
    URL.revokeObjectURL(url)
  }

  function loadSettings() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = e => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result)
          root.value.children = data.map(d => ({
            ...d, expanded: false,
            properties: d.properties.map(p => ({
              ...p,
              propType: ['BaudRate','PortNumber'].includes(p.name) ? 'int' : 'string',
              description: propDesc(p.name),
              editing: false,
            })),
          }))
          nextId = Math.max(...root.value.children.map(d => d.id), nextId) + 1
        } catch { alert('Invalid file format') }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function propDesc(name) {
    return {
      ComName:    'COM port name (e.g., COM1)',
      BaudRate:   'Baud rate for communication',
      IpAddress:  'IP address of the device',
      PortNumber: 'Port number for connection',
    }[name] ?? ''
  }
</script>

<template>
  <div class="dc-view" @click="hideCtx">

    <!-- Toolbar -->
    <div class="view-toolbar">
      <button class="toolbar-btn" @click.stop="saveSettings"><font-awesome-icon icon="floppy-disk" style="color: var(--accent)" /> Save Settings</button>
      <button class="toolbar-btn" @click.stop="loadSettings"><font-awesome-icon icon="folder-open" style="color: #e6a817" /> Load Settings</button>
    </div>

    <!-- Column headers -->
    <div class="dc-header">
      <div class="dc-col-name">Name</div>
      <div class="dc-col-value">Value</div>
      <div class="dc-col-desc">Description</div>
    </div>

    <!-- Tree -->
    <div class="dc-tree">

      <!-- Root row -->
      <div
        class="dc-row dc-row-category"
        @click.stop="root.expanded = !root.expanded"
        @contextmenu="onRootRightClick"
      >
        <div class="dc-col-name">
          <span class="dc-toggle">{{ root.expanded ? '▾' : '▸' }}</span>
          <font-awesome-icon icon="link" style="color: var(--accent)" /> Device Connections
        </div>
        <div class="dc-col-value" />
        <div class="dc-col-desc">Network and serial device connections</div>
      </div>

      <!-- Devices -->
      <template v-if="root.expanded">
        <template v-for="device in root.children" :key="device.id">

          <!-- Device row -->
          <div
            class="dc-row dc-row-device"
            @click.stop="device.expanded = !device.expanded"
            @contextmenu="e => onDeviceRightClick(e, device)"
          >
            <div class="dc-col-name">
              <span class="dc-indent" />
              <span class="dc-toggle">{{ device.expanded ? '▾' : '▸' }}</span>
              <font-awesome-icon :icon="device.type === 'com' ? 'plug' : 'network-wired'" :style="{ color: device.type === 'com' ? '#4caf50' : 'var(--accent)' }" class="dc-device-icon" />
              {{ device.name }}
            </div>
            <div class="dc-col-value" />
            <div class="dc-col-desc">{{ device.type === 'com' ? 'Serial COM device' : 'TCP/IP device' }}</div>
          </div>

          <!-- Properties -->
          <template v-if="device.expanded">
            <div
              v-for="prop in device.properties"
              :key="prop.name"
              class="dc-row dc-row-prop"
              :class="{ 'prop-edit-active': prop.editing }"
            >
              <div class="dc-col-name">
                <span class="dc-indent" /><span class="dc-indent" />
                {{ prop.name }}
              </div>

              <!-- Value cell -->
              <div class="dc-col-value" @dblclick.stop="startEdit(prop)">
                <!-- Display -->
                <span v-if="!prop.editing" class="dc-value-display">{{ prop.value }}</span>

                <!-- String edit -->
                <input
                  v-else-if="prop.propType === 'string'"
                  type="text"
                  class="dc-input"
                  v-model="prop.value"
                  @blur="commitEdit(prop)"
                  @keydown="e => onEditKey(e, prop)"
                />

                <!-- Int edit -->
                <input
                  v-else-if="prop.propType === 'int'"
                  type="number"
                  step="1"
                  class="dc-input dc-input-num"
                  v-model="prop.value"
                  @blur="commitEdit(prop)"
                  @keydown="e => onEditKey(e, prop)"
                />
              </div>

              <div class="dc-col-desc">{{ prop.description }}</div>
            </div>
          </template>

        </template>
      </template>
    </div>

    <!-- Context menu -->
    <div
      v-if="ctx.visible"
      class="context-menu"
      :style="{ top: ctx.y + 'px', left: ctx.x + 'px' }"
      @click.stop
    >
      <template v-if="ctx.mode === 'category'">
        <button class="context-item" @click="addDevice('com')">
          <font-awesome-icon icon="plug" class="context-icon" style="color: #4caf50" /> Add COM Device
        </button>
        <button class="context-item" @click="addDevice('ip')">
          <font-awesome-icon icon="network-wired" class="context-icon" style="color: var(--accent)" /> Add IP Device
        </button>
      </template>
      <template v-else-if="ctx.mode === 'device'">
        <button class="context-item context-item-danger" @click="deleteDevice(ctx.target)">
          <font-awesome-icon icon="trash" class="context-icon" /> Delete
        </button>
      </template>
    </div>

  </div>
</template>

<style scoped>
.dc-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* Header */
.dc-header {
  display: flex;
  background: var(--bg-table-header);
  border-bottom: 2px solid var(--border-color);
  font-weight: 600;
  font-size: 12px;
  padding: 5px 0;
  flex-shrink: 0;
  user-select: none;
}

/* Tree */
.dc-tree {
  flex: 1;
  overflow-y: auto;
}

/* Shared column widths */
.dc-col-name  { 
  width: 240px; flex-shrink: 0; padding: 0 8px; display: flex; align-items: center; gap: 4px; 
}
.dc-col-value { 
  width: 200px; flex-shrink: 0; padding: 0 6px; display: flex; align-items: center; 
}
.dc-col-desc  { 
  flex: 1; padding: 0 8px; display: flex; align-items: center; font-size: 11px; color: var(--text-secondary); 
}

/* Rows */
.dc-row {
  display: flex;
  align-items: stretch;
  min-height: 26px;
  border-bottom: 1px solid var(--border-color);
  cursor: default;
}
.dc-row:hover { 
  background: var(--bg-table-hover); 
}

.dc-row-category {
  background: var(--bg-table-header);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.dc-row-category:hover { 
  background: var(--bg-ribbon-btn-hover); 
}

.dc-row-device {
  background: var(--bg-table-alt);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
.dc-row-device:hover { 
  background: var(--bg-table-hover); 
}

.dc-row-prop {
  font-size: 12px;
}

/* Indentation & toggles */
.dc-indent { 
  display: inline-block; width: 18px; flex-shrink: 0; 
}
.dc-toggle { 
  font-size: 10px; color: var(--text-secondary); flex-shrink: 0; 
}
.dc-device-icon { 
  flex-shrink: 0; 
}

/* Value display */
.dc-value-display {
  cursor: text;
  min-width: 20px;
  padding: 2px 4px;
  border-radius: 2px;
  border: 1px solid transparent;
}
.dc-row-prop:hover .dc-value-display { 
  border-color: var(--border-color); 
}

/* Inline inputs */
.dc-input {
  width: 100%;
  padding: 1px 4px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--accent);
  border-radius: 2px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}
.dc-input-num { 
  width: 100px; 
}

.context-icon {
  width: 14px;
  flex-shrink: 0;
}
</style>
