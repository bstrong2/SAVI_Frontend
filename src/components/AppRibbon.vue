<script setup>
import { computed } from 'vue'
import { PERMISSIONS, canAccess } from '../auth/roles.js'
import { RUN_COMMANDS, OTHER_COMMANDS, RUN_STATUS, VIEWS } from '../constants/enums.js'
import { COLORS } from '../constants/colors.js'

/////////////////////////////////////////////
// Define variables.
const props = defineProps({
  activeView: String,
  connectionStatus: String,
  statusColor: String,
  isDark: Boolean,
  currentUser: Object,
  runState: { type: String, default: RUN_STATUS.Idle },
  isLogOnly: { type: Boolean, default: false },
})

// Define what buttons are available based on what user level is logged in.
const allScreensButtons = [
  { id: VIEWS.DeviceLayout, icon: 'table-cells', color: COLORS.lightBlue, label: 'Device Layout', permission: PERMISSIONS.Public },
  { id: VIEWS.LoggingDetails, icon: 'chart-line', color: COLORS.violet, label: 'Log Details', permission: PERMISSIONS.AuthRequired },
  { id: VIEWS.Recipe, icon: 'list-check', color: COLORS.amber, label: 'Recipe (WIP)',  permission: PERMISSIONS.OperatorOnly },
  { id: VIEWS.Settings, icon: 'gear', color: COLORS.gray, label: 'Settings', permission: PERMISSIONS.OperatorOnly },
  { id: VIEWS.Users, icon: 'users', color: COLORS.violet, label: 'Users', permission: PERMISSIONS.AdminOnly },
]

// define emits
const emit = defineEmits(['navigate', 'run-command', 'other-command', 'toggle-theme'])


/////////////////////////////////////////////
// Define computed properties.

// Determine if buttons in the log details view should show up.
const showStart = computed(() => props.runState === RUN_STATUS.Idle)
const showLogOnly = computed(() => props.runState === RUN_STATUS.Idle)
const showPause = computed(() => props.runState === RUN_STATUS.Running && props.isLogOnly)
const showResume = computed(() => props.runState === RUN_STATUS.Paused && props.isLogOnly)
const showStop = computed(() => props.runState === RUN_STATUS.Running || props.runState === RUN_STATUS.Paused)

const isAdmin = computed(() => canAccess(props.currentUser, PERMISSIONS.AdminOnly))
const canOperate = computed(() => canAccess(props.currentUser, PERMISSIONS.OperatorOnly))

const themeIcon = computed(() => props.isDark ? 'sun' : 'moon')
const themeColor = computed(() => props.isDark ? COLORS.amber : COLORS.slate)
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
    <div class="ribbon-title" style="cursor:pointer" @click="emit('navigate', VIEWS.DeviceLayout)">
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
      <div v-if="activeView === VIEWS.LoggingDetails && canOperate" class="ribbon-group">
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
            <font-awesome-icon icon="clipboard-list" :style="{ color: COLORS.amber }" class="ribbon-icon" />Generate Report
          </button>
          <button v-if="currentUser" class="ribbon-btn" @click="emit('other-command', OTHER_COMMANDS.Logout)">
            <font-awesome-icon icon="lock-open" :style="{ color: COLORS.lightAmber }" class="ribbon-icon" />Logout
          </button>
          <button v-else class="ribbon-btn" @click="emit('other-command', OTHER_COMMANDS.Login)">
            <font-awesome-icon icon="key" :style="{ color: COLORS.lightAmber }" class="ribbon-icon" />Login
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

  .ribbon {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    background: var(--bg-ribbon);
    border-bottom: 1px solid var(--ribbon-border);
    flex-shrink: 0;
    user-select: none;
  }

  .ribbon-groups {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
  }

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

  .ribbon-logo {
    height: 46px;
    width: 46px;
    object-fit: contain;
    flex-shrink: 0;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
  }

  .logo-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo-name {
    font-size: 21px;
    font-weight: 800;
    letter-spacing: 3px;
    color: var(--logo-name-color);
    line-height: 1;
  }

  .logo-subtitle {
    font-size: 9.5px;
    font-weight: 500;
    letter-spacing: 0.4px;
    color: var(--logo-name-color);
    opacity: 0.65;
    line-height: 1;
    white-space: nowrap;
  }

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

  .ribbon-group-label {
    text-align: center;
    font-size: 10px;
    color: var(--group-label-color);
    padding-top: 3px;
    border-top: 1px solid var(--border-color);
    margin-top: 4px;
  }

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

  .ribbon-btn:active,
  .ribbon-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--color-white) !important;
  }

  .ribbon-icon {
    font-size: 22px;
    line-height: 1;
  }
  .ribbon-btn.active .ribbon-icon,
  .ribbon-btn:active .ribbon-icon {
    color: var(--color-white) !important;
  }

  .ribbon-btn.run-start:not(.active) { color: var(--color-darkGreen); }
  .ribbon-btn.run-log-only:not(.active) { color: var(--color-cyan); }
  .ribbon-btn.run-pause:not(.active) { color: var(--color-darkOrange); }
  .ribbon-btn.run-resume:not(.active) { color: var(--color-skyBlue); }
  .ribbon-btn.run-stop:not(.active)  { color: var(--color-darkRed); }

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

  .conn-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .conn-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ribbon-user {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

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
