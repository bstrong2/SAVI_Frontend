<script setup>
defineProps({
  activeView:       String,
  connectionStatus: String,
  statusColor:      String,
  isDark:           Boolean,
})

const emit = defineEmits(['navigate', 'run-command', 'other-command', 'toggle-theme'])

const screensButtons = [
  { id: 'device-layout',   icon: '⊞', label: 'Device Layout' },
  { id: 'logging-details', icon: '📈', label: 'Log Details' },
  { id: 'settings',        icon: '⚙',  label: 'Settings' },
  { id: 'users',           icon: '👥', label: 'Users' },
]

const runButtons = [
  { id: 'start',  icon: '▶', label: 'Start',  cls: 'run-start' },
  { id: 'pause',  icon: '⏸', label: 'Pause',  cls: 'run-pause' },
  { id: 'resume', icon: '↻', label: 'Resume', cls: 'run-resume' },
  { id: 'stop',   icon: '⏹', label: 'Stop',   cls: 'run-stop' },
]

const otherButtons = [
  { id: 'login',           icon: '🔑', label: 'Login' },
  { id: 'generate-report', icon: '📋', label: 'Generate Report' },
  { id: 'write-to-log',    icon: '📝', label: 'Write to Log' },
]
</script>

<template>
  <div class="ribbon">
    <div class="ribbon-title">
      <img src="/logo.png" alt="SAVI" class="ribbon-logo" />
      <span>SAVI 2.0</span>
    </div>

    <!-- Screens -->
    <div class="ribbon-group">
      <div class="ribbon-group-btns">
        <button
          v-for="btn in screensButtons"
          :key="btn.id"
          class="ribbon-btn"
          :class="{ active: activeView === btn.id }"
          @click="emit('navigate', btn.id)"
        >
          <span class="ribbon-icon">{{ btn.icon }}</span>
          {{ btn.label }}
        </button>
      </div>
      <div class="ribbon-group-label">Screens</div>
    </div>

    <!-- Run Options -->
    <div class="ribbon-group">
      <div class="ribbon-group-btns">
        <button
          v-for="btn in runButtons"
          :key="btn.id"
          class="ribbon-btn"
          :class="btn.cls"
          @click="emit('run-command', btn.id)"
        >
          <span class="ribbon-icon">{{ btn.icon }}</span>
          {{ btn.label }}
        </button>
      </div>
      <div class="ribbon-group-label">Run Options</div>
    </div>

    <!-- Other Options -->
    <div class="ribbon-group">
      <div class="ribbon-group-btns">
        <button
          v-for="btn in otherButtons"
          :key="btn.id"
          class="ribbon-btn"
          @click="emit('other-command', btn.id)"
        >
          <span class="ribbon-icon">{{ btn.icon }}</span>
          {{ btn.label }}
        </button>
      </div>
      <div class="ribbon-group-label">Other Options</div>
    </div>

    <!-- Right: status + theme toggle -->
    <div class="ribbon-right">
      <div class="conn-status">
        <span class="conn-dot" :style="{ backgroundColor: statusColor }" />
        {{ connectionStatus }}
      </div>
      <button class="theme-btn" @click="emit('toggle-theme')" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
        {{ isDark ? '☀' : '🌙' }}
      </button>
    </div>
  </div>
</template>
