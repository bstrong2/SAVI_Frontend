<script setup>
  import { computed } from 'vue'

  const props = defineProps({
    item: { type: Object,  required: true },
    isEditMode: { type: Boolean, default: false },
    isSelected: { type: Boolean, default: false },
  })

  const emit = defineEmits(['drag-start', 'resize-start', 'select'])

  function rectTextColor(hex) {
    if (!hex)
      return '#fff'
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff'
  }

  const tileStyle = computed(() => ({
    left:       props.item.x + 'px',
    top:        props.item.y + 'px',
    width:      props.item.w + 'px',
    height:     props.item.h + 'px',
    background: props.item.color,
    color:      rectTextColor(props.item.color),
  }))

  const nameStyle = computed(() => ({
    fontSize:   props.item.fontSize + 'px',
    fontWeight: props.item.fontWeight,
    textAlign:  props.item.textAlign,
    color:      props.item.textColor || rectTextColor(props.item.color),
  }))

  const gripStyle = computed(() => ({
    color: rectTextColor(props.item.color),
  }))
</script>

<template>
  <div class="rect-tile" :class="{ editable: isEditMode, selected: isSelected }"
    :style="tileStyle"
    @mousedown="emit('drag-start', $event)" @click="emit('select', $event)"
  >
    <span class="rect-tile-name" :style="nameStyle">{{ item.name }}</span>

    <button
      v-if="isEditMode"
      class="rect-resize-grip"
      :style="gripStyle"
      @mousedown.stop="emit('resize-start', $event)"
    >◢</button>
  </div>
</template>

<style scoped>
  .rect-tile {
    position: absolute;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 3px;
    cursor: default;
    overflow: hidden;
    min-width: 100px;
    min-height: 50px;
    z-index: 1;
  }

  .rect-tile.editable {
    cursor: move;
  }

  .rect-tile.selected {
    outline: 3px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
  }

  .rect-tile-name {
    display: block;
    padding: 6px 8px 4px;
    font-size: 13px;
    font-weight: 600;
  }

  .rect-resize-grip {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    padding: 0;
    font-size: 14px;
    line-height: 20px;
    text-align: center;
    cursor: se-resize;
    opacity: 0.6;
  }
  .rect-resize-grip:hover {
    opacity: 1;
  }
</style>
