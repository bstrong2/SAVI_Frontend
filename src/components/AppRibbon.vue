<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  activeView:       String,
  connectionStatus: String,
  statusColor:      String,
  isDark:           Boolean,
})

const emit = defineEmits(['navigate', 'run-command', 'other-command', 'toggle-theme'])

// 'idle' → only Start shown
// 'running' → Pause + Stop shown
// 'paused' → Resume + Stop shown
const runState = ref('idle')

const showStart  = computed(() => runState.value === 'idle')
const showPause  = computed(() => runState.value === 'running')
const showResume = computed(() => runState.value === 'paused')
const showStop   = computed(() => runState.value === 'running' || runState.value === 'paused')

function handleRun(cmd) {
  if (cmd === 'start')  runState.value = 'running'
  if (cmd === 'pause')  runState.value = 'paused'
  if (cmd === 'resume') runState.value = 'running'
  if (cmd === 'stop')   runState.value = 'idle'
  emit('run-command', cmd)
}

const screensButtons = [
  { id: 'device-layout',   icon: '⊞', label: 'Device Layout' },
  { id: 'logging-details', icon: '📈', label: 'Log Details' },
  { id: 'settings',        icon: '⚙',  label: 'Settings' },
  { id: 'users',           icon: '👥', label: 'Users' },
]

const otherButtons = [
  { id: 'login',           icon: '🔑', label: 'Login' },
  { id: 'generate-report', icon: '📋', label: 'Generate Report' },
]
</script>

<template>
  <div class="ribbon">
    <div class="ribbon-title" style="cursor:pointer" @click="emit('navigate', 'device-layout')">
      <img src="/logo.png" alt="SAVI" class="ribbon-logo" />
      <div class="logo-name">SAVI</div>
    </div>

    <!-- Wrapping groups -->
    <div class="ribbon-groups">
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

      <!-- Run Options — only on Log Details screen -->
      <div v-if="activeView === 'logging-details'" class="ribbon-group">
        <div class="ribbon-group-btns">
          <button v-if="showStart"  class="ribbon-btn run-start"  @click="handleRun('start')" ><span class="ribbon-icon">▶</span>Start</button>
          <button v-if="showPause"  class="ribbon-btn run-pause"  @click="handleRun('pause')" ><span class="ribbon-icon">⏸</span>Pause</button>
          <button v-if="showResume" class="ribbon-btn run-resume" @click="handleRun('resume')"><span class="ribbon-icon">↻</span>Resume</button>
          <button v-if="showStop"   class="ribbon-btn run-stop"   @click="handleRun('stop')"  ><span class="ribbon-icon">⏹</span>Stop</button>
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
    </div>

    <!-- Pinned top-right: status + theme toggle -->
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
