<script setup>
import { ref } from 'vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'

const settings = ref([
  { id: 1, depth: 0, name: 'Connection',      value: '',          description: 'Connection settings',              type: 'group' },
  { id: 2, depth: 1, name: 'Host',             value: 'localhost', description: 'Backend host address',             type: 'string', editing: false },
  { id: 3, depth: 1, name: 'Port',             value: 5176,        description: 'Backend port number',              type: 'int',    editing: false },
  { id: 4, depth: 1, name: 'Reconnect on Loss',value: true,        description: 'Auto-reconnect when disconnected', type: 'bool',   editing: false },
  { id: 5, depth: 0, name: 'Logging',          value: '',          description: 'Logging settings',                 type: 'group' },
  { id: 6, depth: 1, name: 'Log Level',        value: 'Info',      description: 'Minimum log level to display',     type: 'string', editing: false },
  { id: 7, depth: 1, name: 'Max Entries',      value: 1000,        description: 'Maximum log rows to keep in view', type: 'int',    editing: false },
  { id: 8, depth: 1, name: 'Auto Scroll',      value: true,        description: 'Auto-scroll log to newest entry',  type: 'bool',   editing: false },
  { id: 9, depth: 0, name: 'Acquisition',      value: '',          description: 'Data acquisition settings',        type: 'group' },
  { id: 10, depth: 1, name: 'Poll Interval (ms)', value: 1000,     description: 'How often to poll sensors',        type: 'int',    editing: false },
  { id: 11, depth: 1, name: 'Timeout (ms)',    value: 5000,        description: 'Sensor read timeout',              type: 'int',    editing: false },
])

function startEdit(s) {
  if (s.type !== 'group') s.editing = true
}

function stopEdit(s) {
  s.editing = false
}

function handleKeyDown(e, s) {
  if (e.key === 'Enter' || e.key === 'Escape') stopEdit(s)
}

async function saveSettings() {
  try {
    await fetch(`${BACKEND_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value),
    })
  } catch {
    // endpoint not yet implemented — silently ignore
  }
}

async function loadSettings() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings`)
    if (res.ok) settings.value = await res.json()
  } catch {
    // endpoint not yet implemented — silently ignore
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="view-toolbar">
      <button class="toolbar-btn" @click="saveSettings">💾 Save Settings</button>
      <button class="toolbar-btn" @click="loadSettings">📂 Load Settings</button>
    </div>

    <div class="settings-table">
      <table>
        <thead>
          <tr>
            <th style="width:240px">Name</th>
            <th style="width:200px">Value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in settings"
            :key="s.id"
            :class="{ 'settings-group-row': s.type === 'group' }"
          >
            <td>
              <span class="depth-indent" :style="{ width: s.depth * 20 + 'px' }" />
              {{ s.name }}
            </td>

            <!-- Value cell -->
            <td @dblclick="startEdit(s)">
              <!-- group rows: no value -->
              <template v-if="s.type === 'group'" />

              <!-- bool: checkbox always visible -->
              <template v-else-if="s.type === 'bool'">
                <input type="checkbox" v-model="s.value" />
              </template>

              <!-- string / int: show text or edit input -->
              <template v-else>
                <span v-if="!s.editing" style="cursor:pointer" @dblclick="startEdit(s)">{{ s.value }}</span>
                <input
                  v-else
                  :type="s.type === 'int' ? 'number' : 'text'"
                  v-model="s.value"
                  @blur="stopEdit(s)"
                  @keydown="handleKeyDown($event, s)"
                  style="width:100%"
                  autofocus
                />
              </template>
            </td>

            <td>{{ s.description }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
