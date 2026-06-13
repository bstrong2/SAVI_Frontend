<script setup>
import { ref, computed, inject } from 'vue'

const emit = defineEmits(['confirm', 'cancel'])

const currentUser = inject('currentUser')
const layoutItems = inject('layoutItems')

const notes       = ref('')
const selectedIds = ref(new Set())

// All sensor tiles placed on the canvas
const sensorList = computed(() =>
  (layoutItems?.value ?? []).filter(i => i.type === 'sensor')
)

const startedBy = computed(() =>
  currentUser?.value
    ? `${currentUser.value.username} (${currentUser.value.role})`
    : 'Unknown'
)

// ── Selection helpers ──────────────────────────────────────────────────────

function toggleSensor(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function selectAll() {
  selectedIds.value = new Set(sensorList.value.map(s => s.id))
}

function clearAll() {
  selectedIds.value = new Set()
}

const allSelected = computed(() =>
  sensorList.value.length > 0 &&
  sensorList.value.every(s => selectedIds.value.has(s.id))
)

const canSubmit = computed(() => selectedIds.value.size > 0)

// ── Submit / keyboard ──────────────────────────────────────────────────────

function submit() {
  if (!canSubmit.value) return
  const selectedSensors = sensorList.value
    .filter(s => selectedIds.value.has(s.id))
    .map(s => ({
      id:         s.id,
      name:       s.name,
      driver:     s.driver      ?? '',
      connection: s.connection  ?? '',
      unit:       s.unit        ?? '',
    }))
  emit('confirm', {
    startedBy:       startedBy.value,
    notes:           notes.value,
    selectedSensors,
  })
}

function onKeydown(e) {
  if (e.key === 'Enter' && e.ctrlKey) submit()
  if (e.key === 'Escape') emit('cancel')
}

// ── Badge helpers ──────────────────────────────────────────────────────────

function driverLabel(driver) {
  if (!driver) return '—'
  if (driver === 'relay')              return 'Relay'
  if (driver === 'collision-detector') return 'Collision'
  return driver
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')" @keydown="onKeydown" tabindex="0">
    <div class="modal-box log-only-dialog">

      <h3 class="log-only-title">Log Only</h3>

      <!-- Started By (read-only) -->
      <div class="modal-row">
        <label class="modal-label">Started By:</label>
        <input class="modal-input" :value="startedBy" readonly />
      </div>

      <!-- Notes -->
      <div class="modal-row log-only-notes-row">
        <label class="modal-label">Notes:</label>
        <textarea
          class="modal-input log-only-textarea"
          v-model="notes"
          rows="2"
          placeholder="Optional notes…"
        />
      </div>

      <!-- Sensor picker ─────────────────────────────────────────────── -->
      <div class="log-only-section">

        <div class="log-only-section-header">
          <span class="log-only-section-label">Sensors to Log</span>
          <span v-if="sensorList.length > 0" class="log-only-section-actions">
            <button class="link-btn" @click="selectAll" :disabled="allSelected">Select All</button>
            <span class="link-sep">·</span>
            <button class="link-btn" @click="clearAll" :disabled="selectedIds.size === 0">Clear</button>
          </span>
        </div>

        <div v-if="sensorList.length === 0" class="sensor-empty">
          No sensors on canvas — add sensors in Device Layout first.
        </div>

        <div v-else class="sensor-list">
          <label
            v-for="s in sensorList"
            :key="s.id"
            class="sensor-row"
            :class="{ 'sensor-row-checked': selectedIds.has(s.id) }"
          >
            <input
              type="checkbox"
              :checked="selectedIds.has(s.id)"
              @change="toggleSensor(s.id)"
            />
            <span class="sensor-name">{{ s.name }}</span>
            <span class="sensor-badge driver-badge">{{ driverLabel(s.driver) }}</span>
            <span class="sensor-badge conn-badge">{{ s.connection || '—' }}</span>
          </label>
        </div>

        <div v-if="sensorList.length > 0" class="sensor-count">
          {{ selectedIds.size }} of {{ sensorList.length }} selected
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          Start Logging
        </button>
        <button class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.log-only-dialog {
  width: 480px;
  max-height: 82vh;
  overflow-y: auto;
}

.log-only-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.log-only-notes-row { align-items: flex-start; }

.log-only-textarea {
  resize: vertical;
  min-height: 48px;
  font-family: inherit;
  font-size: 13px;
}

/* ── Sensor section ── */
.log-only-section { margin: 10px 0 6px; }

.log-only-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.log-only-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.log-only-section-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}
.link-btn:disabled {
  color: var(--text-secondary);
  text-decoration: none;
  cursor: default;
}

.link-sep { font-size: 11px; color: var(--text-secondary); }

/* Scrollable sensor list */
.sensor-list {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-height: 210px;
  overflow-y: auto;
}

.sensor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-primary);
  transition: background 0.1s;
}
.sensor-row:last-child { border-bottom: none; }
.sensor-row:hover      { background: var(--bg-ribbon-btn-hover); }
.sensor-row-checked    {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.sensor-name { flex: 1; font-weight: 500; }

.sensor-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}
.driver-badge {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}
.conn-badge {
  background: color-mix(in srgb, #888 12%, transparent);
  color: var(--text-secondary);
}

.sensor-empty {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 12px 4px;
  font-style: italic;
}

.sensor-count {
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-secondary);
  text-align: right;
}
</style>
