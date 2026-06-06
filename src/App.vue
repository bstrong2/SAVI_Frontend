<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as signalR from '@microsoft/signalr'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'

const connection = ref(null)
const connectionStatus = ref('Disconnected')
const messages = ref([])
const user = ref('User1')
const messageInput = ref('')
const messagesEnd = ref(null)

const statusColor = computed(() => {
  if (connectionStatus.value === 'Connected') return '#4caf50'
  if (connectionStatus.value === 'Disconnected') return '#f44336'
  return '#ff9800'
})

onMounted(async () => {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${BACKEND_URL}/saviHub`)
    .withAutomaticReconnect()
    .build()

  conn.on('ReceiveServerMessage', (message) => {
    messages.value.push({ type: 'server', text: message, time: new Date().toLocaleTimeString() })
    nextTick(() => messagesEnd.value?.scrollIntoView({ behavior: 'smooth' }))
  })

  conn.on('ReceiveMessage', (sender, message) => {
    messages.value.push({ type: 'user', text: `${sender}: ${message}`, time: new Date().toLocaleTimeString() })
    nextTick(() => messagesEnd.value?.scrollIntoView({ behavior: 'smooth' }))
  })

  conn.onreconnecting(() => { connectionStatus.value = 'Reconnecting...' })
  conn.onreconnected(() => { connectionStatus.value = 'Connected' })
  conn.onclose(() => { connectionStatus.value = 'Disconnected' })

  try {
    await conn.start()
    connectionStatus.value = 'Connected'
    connection.value = conn
  } catch (err) {
    connectionStatus.value = `Error: ${err.message}`
    console.error('SignalR connection error:', err)
  }
})

onUnmounted(() => {
  connection.value?.stop()
})

async function sendMessage() {
  if (connection.value && messageInput.value.trim()) {
    await connection.value.invoke('SendMessage', user.value, messageInput.value)
    messageInput.value = ''
  }
}

function handleKeyDown(e) {
  if (e.key === 'Enter') sendMessage()
}
</script>

<template>
  <div class="app">
    <header>
      <h1>SAVI 2.0 — SignalR Demo</h1>
      <div class="status">
        <span class="status-dot" :style="{ backgroundColor: statusColor }" />
        {{ connectionStatus }}
      </div>
    </header>

    <div class="messages">
      <p v-if="messages.length === 0" class="empty">Waiting for messages...</p>
      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.type]">
        <span class="time">{{ msg.time }}</span>
        <span class="text">{{ msg.text }}</span>
      </div>
      <div ref="messagesEnd" />
    </div>

    <div class="input-area">
      <input
        v-model="user"
        placeholder="Your name"
        class="user-input"
      />
      <input
        v-model="messageInput"
        @keydown="handleKeyDown"
        placeholder="Type a message..."
        class="message-input"
        :disabled="connectionStatus !== 'Connected'"
      />
      <button @click="sendMessage" :disabled="connectionStatus !== 'Connected'">
        Send
      </button>
    </div>
  </div>
</template>
