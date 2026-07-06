<script setup>
  import { ref, computed, inject } from 'vue'
  import { PERMISSIONS, canAccess } from '../auth/roles.js'
  import { DRIVERS, DEVICE_TYPES, DEVICE_PROPS } from '../constants/devices.js'
  import { LOG_LEVELS, RUN_STATUS } from '../constants/enums.js'
  import { COLORS } from '../constants/colors.js'


  /////////////////////////////////////////////
  // Define variables.
  const props = defineProps({
    item: { type: Object,  required: true },
    isEditMode: { type: Boolean, default: false },
    isSelected: { type: Boolean, default: false },
  })

  const emit = defineEmits(['drag-start', 'select'])

  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const currentUser = inject('currentUser')
  const addLog = inject('addLog', () => {})
  const runState = inject('runState', ref(RUN_STATUS.Idle))
  const runInfo = inject('runInfo',  ref(null))
  const devices = inject('devices',  ref([]))


  /////////////////////////////////////////////
  // Define computed properties.
  const canOperate = computed(() => canAccess(currentUser?.value, PERMISSIONS.OperatorOnly))
  const isRunning = computed(() => runState.value === RUN_STATUS.Running || runState.value === RUN_STATUS.Paused)

  const tileStyle = computed(() => ({
    left: props.item.x + 'px',
    top: props.item.y + 'px',
    background: props.item.color || 'var(--bg-sensor-tile)',
  }))


  /////////////////////////////////////////////
  // Defining all functions.
  function isRecipeRelay(item) {
    return isRunning.value && runInfo.value?.doSensorId === item.id
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

  async function handleRelayChange(state) {
    const item = props.item
    item.relayState = state

    if (item.connection === DRIVERS.Simulated) {
      try {
        await fetch(`${BACKEND_URL}/api/simulate/relay/${item.id}/${state}`, {
          method:  'POST',
          headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
        })
      } catch (e) {
        addLog(`Simulated relay command failed: ${e.message}`, LOG_LEVELS.Warning)
      }
    } else {
      const deviceId = resolveDeviceId(item.connection)
      if (deviceId !== null) {
        if (item.pin == null) {
          addLog(`Relay "${item.name}" has no pin configured. Please delete and re-add the relay with an associated pin this time.`, LOG_LEVELS.Warning)
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

  async function toggleCollisionSim() {
    const item = props.item
    const nowTriggered = item.value !== 'Collision!'
    const endpoint = nowTriggered ? 'trigger' : 'release'
    item.value = nowTriggered ? 'Collision!' : 'No Contact'

    try {
      await fetch(`${BACKEND_URL}/api/simulate/di/${item.id}/${endpoint}`, {
        method: 'POST',
        headers: authToken?.value ? { Authorization: `Bearer ${authToken.value}` } : {},
      })
    } catch (e) {
      addLog(`Simulated DI command failed: ${e.message}`, LOG_LEVELS.Warning)
    }
  }
</script>

<template>
  <div class="sensor-tile" :class="{ editable: isEditMode, selected: isSelected }" :style="tileStyle"
    @mousedown="emit('drag-start', $event)" @click.stop="isEditMode && emit('select')">
    <div class="sensor-tile-name" :style="{ color: item.textColor || null }">{{ item.name }}</div>

    <!-- Relay: ON / OFF radio buttons -->
    <template v-if="item.driver === DRIVERS.Relay">
      <div class="relay-controls" @mousedown.stop @click.stop>
        <label class="relay-label" :class="{ 'relay-disabled': !canOperate || isRecipeRelay(item) }" 
        :style="{ color: item.textColor || null }">
          <input type="radio" :name="'relay-' + item.id" value="on" :checked="item.relayState === 'on'" :disabled="!canOperate || isRecipeRelay(item)"
            @change="handleRelayChange('on')"/> 
            ON
        </label>

        <label class="relay-label" :class="{ 'relay-disabled': !canOperate || isRecipeRelay(item) }" 
        :style="{ color: item.textColor || null }">
          <input type="radio" :name="'relay-' + item.id" value="off" :checked="item.relayState !== 'on'"
            :disabled="!canOperate || isRecipeRelay(item)" @change="handleRelayChange('off')"/> 
            OFF
        </label>
      </div>
      <div v-if="item.connection === DRIVERS.Simulated" class="sim-badge">SIM</div>
    </template>

    <!-- Collision Detector -->
    <template v-else-if="item.driver === DRIVERS.CollisionDetector">
      <div class="collision-state" :style="{ color: item.textColor || (item.value === 'Collision!' ? COLORS.lightRed : COLORS.lightGreen) }">
        <span class="collision-dot" />
        {{ item.value ?? 'No Contact' }}
      </div>

      <button v-if="item.connection === DRIVERS.Simulated && canOperate" class="sim-trigger-btn"
        :class="{ 'sim-trigger-btn--active': item.value === 'Collision!' }" @mousedown.stop @click.stop="toggleCollisionSim">
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
</template>

<style scoped>
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
    z-index: 2;
  }

  .sensor-tile.editable {
    cursor: move;
    border-color: var(--accent);
  }

  .sensor-tile.selected {
    outline: 2px solid var(--accent);
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
    color: var(--accent);
    font-size: 15px;
    font-weight: 700;
    margin-top: 4px;
  }

  .sensor-tile-unit {
    font-size: 10px;
    color: var(--text-secondary);
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
</style>
