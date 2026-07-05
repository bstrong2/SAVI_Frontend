<script setup>
import { computed } from 'vue'
import { PERMISSIONS, canAccess } from '../auth/roles.js'
import { RUN_COMMANDS, OTHER_COMMANDS } from '../constants/commands.js'
import { RUN_STATUS } from '../constants/runStatus.js'

/////////////////////////////////////////////
// Define variables.
const props = defineProps({
  activeView: String,
  connectionStatus: String,
  statusColor: String,
  isDark: Boolean,
  currentUser: Object,
  runState: { type: String, default: RUN_STATUS.Idle },
})

// Define what buttons are available based on what user level is logged in.
const allScreensButtons = [
  { id: 'device-layout', icon: 'table-cells', color: '#60A5FA', label: 'Device Layout', permission: PERMISSIONS.Public },
  { id: 'logging-details', icon: 'chart-line', color: '#A78BFA', label: 'Log Details', permission: PERMISSIONS.AuthRequired },
  { id: 'recipe', icon: 'list-check', color: '#FB923C', label: 'Recipe (WIP)', permission: PERMISSIONS.OperatorOnly },
  { id: 'settings', icon: 'gear', color: '#9CA3AF', label: 'Settings', permission: PERMISSIONS.OperatorOnly },
  { id: 'users', icon: 'users', color: '#A78BFA', label: 'Users', permission: PERMISSIONS.AdminOnly},
]

// define emits
const emit = defineEmits(['navigate', 'run-command', 'other-command', 'toggle-theme'])


/////////////////////////////////////////////
// Define computed properties.

// Determine if buttons in the log details view should show up.
// Derived from parent-controlled runState prop, will change during run time so need to have this as computed.
const showStart   = computed(() => props.runState === RUN_STATUS.Idle)
const showLogOnly = computed(() => props.runState === RUN_STATUS.Idle)
const showPause   = computed(() => props.runState === RUN_STATUS.Running)
const showResume  = computed(() => props.runState === RUN_STATUS.Paused)
const showStop    = computed(() => props.runState === RUN_STATUS.Running || props.runState === RUN_STATUS.Paused)

const isAdmin    = computed(() => canAccess(props.currentUser, PERMISSIONS.AdminOnly))
const canOperate = computed(() => canAccess(props.currentUser, PERMISSIONS.OperatorOnly))

const themeIcon  = computed(() => props.isDark ? 'sun' : 'moon')
const themeColor = computed(() => props.isDark ? '#FB923C' : '#94A3B8')
const themeTitle = computed(() => props.isDark ? 'Switch to light mode' : 'Switch to dark mode')

// Determine what buttons to show in the ribbon based on the users access level.
const screensButtons = computed(() =>
  allScreensButtons.filter(b => canAccess(props.currentUser, b.permission))
)

/////////////////////////////////////////////
// Defining all functions.
function handleRun(cmd) {
  if (!canOperate.value) 
    return

  // Emit the request back to the parent.
  emit('run-command', cmd)
}

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

<style scoped>
/*
 * ==========================================
 * Ribbon
 * ==========================================
 */

/* 3-column grid: brand panel on the left | button groups in the middle | status/user on the right. */
.ribbon {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  background: var(--bg-ribbon);
  border-bottom: 1px solid var(--ribbon-border);
  flex-shrink: 0;
  user-select: none;
}

/* Wrapping flex row that holds all the individual ribbon button groups. */
.ribbon-groups {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}

/* Teal brand panel on the far left containing the logo and app name. */
.ribbon-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  background: var(--bg-ribbon-title);
  border-right: 1px solid var(--ribbon-title-border);
  white-space: nowrap;
  align-self: stretch;
}

/* The SAVI logo image. */
.ribbon-logo {
  height: 46px;
  width: 46px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
}

/* Vertical stack holding the app name and subtitle. */
.logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Large "SAVI" title text. */
.logo-name {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 3px;
  color: var(--logo-name-color);
  line-height: 1;
}

/* Small tagline/version text below the app name. */
.logo-subtitle {
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.4px;
  color: var(--logo-name-color);
  opacity: 0.65;
  line-height: 1;
  white-space: nowrap;
}

/* One logical group of ribbon buttons (e.g. "Run", "View") with a label beneath. */
.ribbon-group {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 4px;
  border-right: 1px solid var(--ribbon-border);
}

/* Horizontal row of buttons inside a ribbon group. */
.ribbon-group-btns {
  display: flex;
  gap: 3px;
  flex: 1;
  align-items: center;
}

/* Small label displayed below each ribbon group (e.g. "Run", "View", "File"). */
.ribbon-group-label {
  text-align: center;
  font-size: 10px;
  color: var(--group-label-color);
  padding-top: 3px;
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

/* Individual clickable button in the ribbon — icon stacked above a text label. */
.ribbon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-ribbon);
  cursor: pointer;
  padding: 5px 8px;
  min-width: 58px;
  font-size: 11px;
  gap: 3px;
  transition: background 0.1s, border-color 0.1s;
  line-height: 1.2;
}
.ribbon-btn:hover {
  background: var(--bg-ribbon-btn-hover);
  border-color: var(--ribbon-border);
}
/* Active state — filled accent background when a view button is currently selected. */
.ribbon-btn:active,
.ribbon-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff !important;
}

/* Large icon that sits above the button's text label. */
.ribbon-icon {
  font-size: 22px;
  line-height: 1;
}
.ribbon-btn.active .ribbon-icon,
.ribbon-btn:active .ribbon-icon {
  color: #fff !important;
}

/* Per-button accent colors for the run-control buttons when they are not active. */
.ribbon-btn.run-start:not(.active)    { color: #388e3c; }
.ribbon-btn.run-log-only:not(.active) { color: #0097a7; }
.ribbon-btn.run-pause:not(.active)    { color: #f57c00; }
.ribbon-btn.run-resume:not(.active)   { color: #0288d1; }
.ribbon-btn.run-stop:not(.active)     { color: #d32f2f; }

/* Right-side ribbon panel containing the connection status dot and logged-in username. */
.ribbon-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  min-height: 80px;
  align-self: stretch;
  white-space: nowrap;
}

/* Row showing the connection status dot and "Connected / Disconnected" text. */
.conn-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Small colored circle that goes green when SignalR is connected, red when not. */
.conn-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Displays the currently logged-in username. */
.ribbon-user {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Light/dark theme toggle button in the ribbon's right panel. */
.theme-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
  padding: 4px 10px;
  font-size: 15px;
  line-height: 1;
}
.theme-btn:hover { background: var(--bg-ribbon-btn-hover); }
</style>
