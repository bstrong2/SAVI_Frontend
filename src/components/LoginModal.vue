<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'login'])

const username = ref('')
const password = ref('')

function submit() {
  emit('login', { username: username.value, password: password.value })
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-box">
      <div class="modal-row">
        <label class="modal-label">User Name:</label>
        <input
          type="text"
          class="modal-input"
          v-model="username"
          @keydown.enter="submit"
          autofocus
        />
      </div>
      <div class="modal-row">
        <label class="modal-label">Password:</label>
        <input
          type="password"
          class="modal-input"
          v-model="password"
          @keydown.enter="submit"
        />
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="submit">Log In</button>
        <button class="btn btn-secondary" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>
