<script setup>
  import { ref, onMounted } from 'vue'

  /////////////////////////////////////////////
  // Define variables.
  const props = defineProps({
    error: { type: String, default: '' },
    loading: { type: Boolean, default: false },
  })

  /////////////////////////////////////////////
  // Defining the emits.
  const emit = defineEmits(['close', 'login'])

  /////////////////////////////////////////////
  // Define variables.
  const username = ref('')
  const password = ref('')
  const capsLockOn = ref(false)
  const usernameElement = ref(null)

  onMounted(() => usernameElement.value?.focus())

  /////////////////////////////////////////////
  // Defining all functions now.
  // Check for the caps lock key to display to the user that anything that they type will probably be wrong.
  function checkCaps(e) {
    capsLockOn.value = e.getModifierState('CapsLock')
  }

  function submit() {
    if (props.loading) 
      return
    
      emit('login', { username: username.value, password: password.value })
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
      <div v-if="capsLockOn" class="caps-warning">⇪ Caps Lock is on</div>
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
    color: #e65100;
    padding: 2px 0 4px 0;
    text-align: right;
  }
  .login-error {
    font-size: 12px;
    color: #f44336;
    padding: 2px 0 6px 0;
    text-align: center;
  }
</style>
