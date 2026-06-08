<script setup>
import { ref, computed, inject, onMounted } from 'vue'

const emit = defineEmits(['confirm', 'cancel'])

const BACKEND_URL = inject('BACKEND_URL', 'http://localhost:5176')
const currentUser = inject('currentUser')

const notes          = ref('')
const autoReport     = ref(false)
const selectedRecipe = ref('')   // recipe name string

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

// Description of whichever recipe is currently selected in the dropdown
const selectedRecipeDescription = computed(() =>
  recipes.value.find(r => r.name === selectedRecipe.value)?.description ?? ''
)

const canSubmit = computed(() => !!selectedRecipe.value)

function submit() {
  if (!canSubmit.value) return
  emit('confirm', {
    startedBy:  startedBy.value,
    notes:      notes.value,
    recipeName: selectedRecipe.value,
    autoReport: autoReport.value,
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

      <!-- Recipe dropdown -->
      <div class="start-run-section">
        <div class="start-run-section-label">Recipe</div>

        <div v-if="loading" class="recipe-status">Loading recipes…</div>
        <div v-else-if="fetchErr" class="recipe-status recipe-error">Could not load recipes from backend.</div>
        <div v-else>
          <!-- Visible listbox — all recipes shown at once -->
          <select
            class="modal-input recipe-listbox"
            v-model="selectedRecipe"
            :size="recipes.length || 1"
          >
            <option v-for="r in recipes" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>

          <!-- Description of the selected recipe -->
          <div class="recipe-desc-label">Description:</div>
          <textarea
            class="modal-input recipe-description"
            :value="selectedRecipeDescription"
            rows="3"
            readonly
            placeholder="Select a recipe to see its description."
          />
        </div>
      </div>

      <!-- Auto Report checkbox -->
      <div class="start-run-checks">
        <label class="start-run-check-label">
          <input type="checkbox" v-model="autoReport" /> Auto Report
        </label>
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
  /* override the single-line select height so all options show */
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
  resize: none;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-table-alt);
  cursor: default;
  font-style: italic;
  line-height: 1.5;
}

/* ── Checkboxes ── */
.start-run-checks {
  display: flex;
  gap: 22px;
  margin: 10px 0 4px;
}

.start-run-check-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}
</style>
