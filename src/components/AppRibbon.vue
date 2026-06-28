<script setup>
import { computed } from 'vue'
import { PERMISSIONS, canAccess } from '../auth/roles.js'
import { RUN_COMMANDS, OTHER_COMMANDS } from '../constants/commands.js'

const props = defineProps({
  activeView: String,
  connectionStatus: String,
  statusColor: String,
  isDark: Boolean,
  currentUser: Object,
  runState: { type: String, default: 'idle' },
})

const emit = defineEmits(['navigate', 'run-command', 'other-command', 'toggle-theme'])

// Determine if buttons in the log details view should show up.
// Derived from parent-controlled runState prop, will change during run time so need to have this as computed.
const showStart = computed(() => props.runState == 'idle')
const showLogOnly = computed(() => props.runState == 'idle')
const showPause = computed(() => props.runState == 'running')
const showResume = computed(() => props.runState == 'paused')
const showStop = computed(() => props.runState == 'running' || props.runState == 'paused')

const isAdmin    = computed(() => canAccess(props.currentUser, PERMISSIONS.AdminOnly))
const canOperate = computed(() => canAccess(props.currentUser, PERMISSIONS.OperatorOnly))

const themeIcon  = computed(() => props.isDark ? 'sun' : 'moon')
const themeColor = computed(() => props.isDark ? '#FB923C' : '#94A3B8')
const themeTitle = computed(() => props.isDark ? 'Switch to light mode' : 'Switch to dark mode')

function handleRun(cmd) {
  if (!canOperate.value) 
    return

  // Emit the request back to the parent.
  emit('run-command', cmd)
}

// Define what buttons are available based on what user level is logged in.
const allScreensButtons = [
  { id: 'device-layout', icon: 'table-cells', color: '#60A5FA', label: 'Device Layout', permission: PERMISSIONS.Public },
  { id: 'logging-details', icon: 'chart-line', color: '#A78BFA', label: 'Log Details', permission: PERMISSIONS.AuthRequired },
  { id: 'recipe', icon: 'list-check', color: '#FB923C', label: 'Recipe (WIP)', permission: PERMISSIONS.OperatorOnly },
  { id: 'settings', icon: 'gear', color: '#9CA3AF', label: 'Settings', permission: PERMISSIONS.OperatorOnly },
  { id: 'users', icon: 'users', color: '#A78BFA', label: 'Users', permission: PERMISSIONS.AdminOnly},
]

// Determine what buttons to show in the ribbon based on the users access level.
const screensButtons = computed(() =>
  allScreensButtons.filter(b => canAccess(props.currentUser, b.permission))
)
</script>

<template>
  <div class="ribbon">
    <div class="ribbon-title" style="cursor:pointer" @click="emit('navigate', 'device-layout')">
      <img src="/logo.png" alt="SAVI" class="ribbon-logo" />
      <div class="logo-text">
        <div class="logo-name">SAVI</div>
        <div class="logo-subtitle">Sensor Acquisition & Visualization Interface</div>
      </div>
    </div>

    <!-- Wrapping groups -->
    <div class="ribbon-groups">
      <!-- Screens -->
      <div class="ribbon-group">
        <div class="ribbon-group-btns">
          <button v-for="btn in screensButtons" :key="btn.id" class="ribbon-btn" :class="{ active: activeView === btn.id }"
            @click="emit('navigate', btn.id)">
            <font-awesome-icon :icon="btn.icon" :style="{ color: btn.color }" class="ribbon-icon" /> {{ btn.label }}
          </button>
        </div>
        <div class="ribbon-group-label">Screens</div>
      </div>

      <!-- Run Options — only on Log Details screen, only for Admin/Operator -->
      <div v-if="activeView == 'logging-details' && canOperate" class="ribbon-group">
        <div class="ribbon-group-btns">
          <button v-if="showStart" class="ribbon-btn run-start" @click="handleRun(RUN_COMMANDS.Start)"><font-awesome-icon icon="play" class="ribbon-icon"/>Start</button>
          <button v-if="showLogOnly" class="ribbon-btn run-log-only" @click="handleRun(RUN_COMMANDS.LogOnly)"><font-awesome-icon icon="file-pen" class="ribbon-icon"/>Log Only</button>
          <button v-if="showPause" class="ribbon-btn run-pause" @click="handleRun(RUN_COMMANDS.Pause)"><font-awesome-icon icon="pause" class="ribbon-icon"/>Pause</button>
          <button v-if="showResume" class="ribbon-btn run-resume" @click="handleRun(RUN_COMMANDS.Resume)"><font-awesome-icon icon="rotate-right" class="ribbon-icon"/>Resume</button>
          <button v-if="showStop" class="ribbon-btn run-stop" @click="handleRun(RUN_COMMANDS.Stop)"><font-awesome-icon icon="stop" class="ribbon-icon"/>Stop</button>
        </div>
        <div class="ribbon-group-label">Run Options</div>
      </div>

      <!-- Other Options -->
      <div class="ribbon-group">
        <div class="ribbon-group-btns">
          <button v-if="canOperate" class="ribbon-btn" @click="emit('other-command', OTHER_COMMANDS.GenerateReport)">
            <font-awesome-icon icon="clipboard-list" style="color:#FB923C" class="ribbon-icon" />Generate Report
          </button>
          <button v-if="currentUser" class="ribbon-btn" @click="emit('other-command', OTHER_COMMANDS.Logout)">
            <font-awesome-icon icon="lock-open" style="color:#FBBF24" class="ribbon-icon" />Logout
          </button>
          <button v-else class="ribbon-btn" @click="emit('other-command', OTHER_COMMANDS.Login)">
            <font-awesome-icon icon="key" style="color:#FBBF24" class="ribbon-icon" />Login
          </button>
        </div>
        <div class="ribbon-group-label">Other Options</div>
      </div>
    </div>

    <!-- Pinned top-right: connection status + user info + theme toggle -->
    <div class="ribbon-right">
      <div class="conn-status">
        <span class="conn-dot" :style="{ backgroundColor: statusColor }"/>
        {{ connectionStatus }}
      </div>
      <div v-if="currentUser" class="ribbon-user">
        {{ currentUser.username }} · {{ currentUser.role }}
      </div>
      <button class="theme-btn" @click="emit('toggle-theme')" :title="themeTitle">
        <font-awesome-icon :icon="themeIcon" :style="{ color: themeColor }" />
      </button>
    </div>
  </div>
</template>
