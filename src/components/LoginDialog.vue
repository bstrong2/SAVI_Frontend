<script setup>
  import { ref, inject, onMounted } from 'vue'
  import { LOG_LEVELS } from '../constants/enums.js'


  /////////////////////////////////////////////
  // Define variables.
  const username = ref('')
  const password = ref('')
  const capsLockOn = ref(false)
  const usernameElement = ref(null)
  const loading = ref(false)
  const error = ref('')

  const emit = defineEmits(['close'])

  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const currentUser = inject('currentUser')
  const addLog = inject('addLog', (msg, level) => console.error(msg))


  /////////////////////////////////////////////
  // Mounts
  onMounted(() => usernameElement.value?.focus())


  /////////////////////////////////////////////
  // Defining all functions.
  function checkCaps(e) {
    capsLockOn.value = e.getModifierState('CapsLock')
  }

  async function submit() {
    if (loading.value)
      return

    error.value = ''
    loading.value = true

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.value, password: password.value }),
      })

      if (response.status === 401) {
        error.value = 'Invalid username or password, or not authorized for this instance.'
        return
      }
      if (!response.ok) {
        error.value = 'Login failed. Please try again.'
        addLog(`Login failed (HTTP ${response.status})`, LOG_LEVELS.Warning)
        return
      }

      const data = await response.json()
      authToken.value = data.token
      currentUser.value = { username: data.username, role: data.role }
      addLog(`Logged in as ${data.username} (${data.role})`, LOG_LEVELS.Info)
      emit('close')

    } catch (e) {
      error.value = 'Cannot reach the backend.'
      addLog(`Login request failed: ${e.message}`, LOG_LEVELS.Error)

    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-box">
      <div class="dialog-row">
        <label class="dialog-label">User Name:</label>
        <input ref="usernameElement" type="text" class="dialog-input" v-model="username" @keydown.enter="submit"/>
      </div>
      <div class="dialog-row">
        <label class="dialog-label">Password:</label>
        <input type="password" class="dialog-input" v-model="password" @keydown.enter="submit" @keydown="checkCaps" @keyup="checkCaps"/>
      </div>
      <div v-if="capsLockOn" class="caps-warning">Caps Lock is on</div>
      <div v-if="error" class="login-error">{{ error }}</div>
      <div class="dialog-footer">
        <button class="btn btn-primary" :disabled="loading" @click="submit">
          {{ loading ? 'Logging in…' : 'Log In' }}
        </button>
        <button class="btn btn-secondary" :disabled="loading" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .caps-warning {
    font-size: 12px;
    color: var(--color-burntOrange);
    padding: 2px 0 4px 0;
    text-align: right;
  }
  .login-error {
    font-size: 12px;
    color: var(--color-red);
    padding: 2px 0 6px 0;
    text-align: center;
  }
</style>
