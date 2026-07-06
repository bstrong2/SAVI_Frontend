<script setup>
  import { PICKER_TYPES } from '../constants/devices.js'
  import { COLORS } from '../constants/colors.js'

  /////////////////////////////////////////////
  // Define variables.
  const props = defineProps({
    // Added validation to this just in case someone still uses a string somewhere, just want to make sure that there is a check so the console will output a warning to for the developer.
    type: { type: String, required: true, validator: (val) => Object.values(PICKER_TYPES).includes(val) },
    show: { type: Boolean, default: false },
    colors: { type: Array,  required: true },
    modelValue: { type: String, default: null },
    previewStyle: { type: Object, default: () => ({}) },
  })

  // define emits
  const emit = defineEmits(['toggle', 'pick', 'confirm', 'cancel', 'auto'])

  
  /////////////////////////////////////////////
  // Defining all functions.
  function swatchStyle(c) {
    return {
      background: c,
      borderColor: c === COLORS.white ? '#ccc' : 'transparent',
    }
  }
</script>

<template>
  <div class="color-picker-wrap" @click.stop>
    <button class="toolbar-btn color-preview-btn" @click="emit('toggle')">
      <span class="color-preview-dot" :style="previewStyle" />
      {{ props.type }}
    </button>
    <div v-if="show" class="color-picker-popup">
      <div class="color-swatches">
        <button v-for="c in colors" :key="c" class="color-swatch" :class="{ active: modelValue === c }"
          :style="swatchStyle(c)" @click="emit('pick', c)"
        />
      </div>
      <div class="color-picker-footer">
        <button class="btn btn-primary" style="font-size:12px; padding:4px 14px" @click="emit('confirm')">OK</button>
        <button v-if="props.type === PICKER_TYPES.Text" class="toolbar-btn" style="font-size:12px" @click="emit('auto')">Auto</button>
        <button class="toolbar-btn" style="font-size:12px" @click="emit('cancel')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .color-picker-wrap {
    position: relative;
  }

  .color-preview-btn {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-preview-dot {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0,0,0,0.2);
    flex-shrink: 0;
  }

  .color-picker-popup {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    padding: 12px;
    z-index: 200;
  }

  .color-swatches {
    display: grid;
    grid-template-columns: repeat(8, 28px);
    gap: 5px;
    margin-bottom: 10px;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .color-swatch:hover {
    transform: scale(1.15);
    border-color: rgba(0,0,0,0.25);
  }
  .color-swatch.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .color-picker-footer {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
</style>
