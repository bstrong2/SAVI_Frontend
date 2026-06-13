<script setup>
import { ref, computed, inject, watch, onMounted } from 'vue'

const emit = defineEmits(['confirm', 'cancel'])

const BACKEND_URL = inject('BACKEND_URL', 'http://localhost:5176')
const currentUser = inject('currentUser')
const layoutItems = inject('layoutItems', ref([]))

const notes          = ref('')
const selectedRecipe = ref('')

// Recipes fetched from GET /api/recipes
const recipes  = ref([])
const loading  = ref(true)
const fetchErr = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/recipes`)
    if (res.ok) {
      recipes.value = await res.json()
      if (recipes.value.length) selectedRecipe.value = recipes.value[0].name
    } else {
      fetchErr.value = true
    }
  } catch {
    fetchErr.value = true
  } finally {
    loading.value = false
  }
})

const startedBy = computed(() =>
  currentUser?.value
    ? `${currentUser.value.username} (${currentUser.value.role})`
    : 'Unknown'
)

const selectedRecipeObj = computed(() =>
  recipes.value.find(r => r.name === selectedRecipe.value) ?? null
)

const selectedRecipeDescription = computed(() =>
  selectedRecipeObj.value?.description ?? ''
)

// DO = relay tiles, DI = collision-detector tiles from the canvas
const doSensors = computed(() =>
  layoutItems.value.filter(i => i.type === 'sensor' && i.driver === 'relay')
)
const diSensors = computed(() =>
  layoutItems.value.filter(i => i.type === 'sensor' && i.driver === 'collision-detector')
)

const selectedDoId = ref(null)
const selectedDiId = ref(null)

// Default selections whenever the sensor lists change
watch(doSensors, (list) => {
  if (list.length && !list.find(s => s.id === selectedDoId.value))
    selectedDoId.value = list[0].id
}, { immediate: true })

watch(diSensors, (list) => {
  if (list.length && !list.find(s => s.id === selectedDiId.value))
    selectedDiId.value = list[0].id
}, { immediate: true })

const selectedDoSensor = computed(() =>
  doSensors.value.find(s => s.id === selectedDoId.value) ?? null
)
const selectedDiSensor = computed(() =>
  diSensors.value.find(s => s.id === selectedDiId.value) ?? null
)

const needsDo = computed(() => !!selectedRecipeObj.value?.requiresDo)
const needsDi = computed(() => !!selectedRecipeObj.value?.requiresDi)

const canSubmit = computed(() => {
  if (!selectedRecipe.value) return false
  if (needsDo.value && !selectedDoSensor.value) return false
  if (needsDi.value && !selectedDiSensor.value) return false
  return true
})

function submit() {
  if (!canSubmit.value) return
  emit('confirm', {
    startedBy:  startedBy.value,
    notes:      notes.value,
    recipeName: selectedRecipe.value,
    doSensor:   needsDo.value ? selectedDoSensor.value : null,
    diSensor:   needsDi.value ? selectedDiSensor.value : null,
  })
}

function onKeydown(e) {
  if (e.key === 'Enter' && e.ctrlKey) submit()
  if (e.key === 'Escape') emit('cancel')
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')" @keydown="onKeydown">
    <div class="modal-box start-run-dialog">

      <h3 class="start-run-title">Start Run</h3>

      <!-- Started By (read-only) -->
      <div class="modal-row">
        <label class="modal-label">Started By:</label>
        <input class="modal-input" :value="startedBy" readonly />
      </div>

      <!-- Run Notes -->
      <div class="modal-row start-run-notes-row">
        <label class="modal-label">Run Notes:</label>
        <textarea
          class="modal-input start-run-textarea"
          v-model="notes"
          rows="3"
          placeholder="Optional notes for this run…"
        />
      </div>

      <!-- Recipe section -->
      <div class="start-run-section">
        <div class="start-run-section-label">Recipe</div>

        <div v-if="loading" class="recipe-status">Loading recipes…</div>
        <div v-else-if="fetchErr" class="recipe-status recipe-error">Could not load recipes from backend.</div>
        <div v-else>
          <!-- Listbox — all recipes shown at once -->
          <select
            class="modal-input recipe-listbox"
            v-model="selectedRecipe"
            :size="recipes.length || 1"
          >
            <option v-for="r in recipes" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>

          <!-- Description -->
          <div class="recipe-desc-label">Description:</div>
          <textarea
            class="modal-input recipe-description"
            :value="selectedRecipeDescription"
            rows="7"
            readonly
            placeholder="Select a recipe to see its description."
          />

          <!-- DO sensor selector -->
          <template v-if="needsDo">
            <div class="sensor-select-label">
              Digital Output (Relay):
              <span v-if="doSensors.length === 0" class="sensor-warn">No relay tiles on canvas</span>
            </div>
            <select
              class="modal-input"
              v-model="selectedDoId"
              :disabled="doSensors.length === 0"
            >
              <option v-for="s in doSensors" :key="s.id" :value="s.id">
                {{ s.name }} ({{ s.connection === 'Simulated' ? 'SIM' : s.connection }})
              </option>
            </select>
          </template>

          <!-- DI sensor selector -->
          <template v-if="needsDi">
            <div class="sensor-select-label">
              Digital Input (Collision Detector):
              <span v-if="diSensors.length === 0" class="sensor-warn">No DI tiles on canvas</span>
            </div>
            <select
              class="modal-input"
              v-model="selectedDiId"
              :disabled="diSensors.length === 0"
            >
              <option v-for="s in diSensors" :key="s.id" :value="s.id">
                {{ s.name }} ({{ s.connection === 'Simulated' ? 'SIM' : s.connection }})
              </option>
            </select>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">OK</button>
        <button class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  padding-bottom: 12vh;
}

.start-run-dialog {
  width: 460px;
  max-height: 80vh;
  overflow-y: auto;
}

.start-run-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.start-run-notes-row { align-items: flex-start; }

.start-run-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
  font-size: 13px;
}

/* ── Recipe section ── */
.start-run-section {
  margin: 8px 0 4px;
}

.start-run-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.recipe-status {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 0;
  font-style: italic;
}

.recipe-error { color: #f44336; }

.recipe-listbox {
  width: 100%;
  margin-bottom: 8px;
  height: auto;
  padding: 0;
}

.recipe-listbox option {
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}

.recipe-desc-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.recipe-description {
  width: 100%;
  height: auto;
  min-height: 60px;
  resize: none;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-table-alt);
  cursor: default;
  font-style: italic;
  line-height: 1.5;
  margin-bottom: 10px;
}

/* ── Sensor selectors ── */
.sensor-select-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin: 8px 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sensor-warn {
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  color: #f57c00;
  font-style: italic;
}
</style>
