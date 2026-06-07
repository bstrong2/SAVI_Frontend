<script setup>
import { ref, inject, onMounted } from 'vue'

const BACKEND_URL = inject('BACKEND_URL', 'http://localhost:5176')
const authToken   = inject('authToken')

const roles = ['Admin', 'Operator', 'Viewer']

const username     = ref('')
const password     = ref('')
const selectedRole = ref('Operator')
const isGlobal     = ref(false)

const users    = ref([])
const loading  = ref(false)
const error    = ref('')
const addError = ref('')

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${authToken?.value ?? ''}`,
  }
}

async function fetchUsers() {
  loading.value = true
  error.value   = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/users`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    users.value = await res.json()
  } catch (e) {
    error.value = `Failed to load users: ${e.message}`
  } finally {
    loading.value = false
  }
}

async function addUser() {
  if (!username.value.trim() || !password.value) return
  addError.value = ''
  try {
    const res = await fetch(`${BACKEND_URL}/api/users`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({
        username: username.value.trim(),
        password: password.value,
        role:     selectedRole.value,
        isGlobal: isGlobal.value,
      }),
    })
    if (res.status === 409) {
      addError.value = 'Username already exists.'
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    username.value     = ''
    password.value     = ''
    selectedRole.value = 'Operator'
    isGlobal.value     = false
    await fetchUsers()
  } catch (e) {
    addError.value = `Failed to add user: ${e.message}`
  }
}

async function removeUser(user) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/${user.id}`, {
      method:  'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await fetchUsers()
  } catch (e) {
    error.value = `Failed to remove user: ${e.message}`
  }
}

onMounted(fetchUsers)
</script>

<template>
  <div class="users-view">
    <h2>Manage Allowed Users</h2>

    <!-- Add user form -->
    <div class="card" style="max-width:520px">
      <div class="add-user-form">
        <label>Username</label>
        <input type="text" v-model="username" placeholder="Enter username" />

        <label>Password</label>
        <input type="password" v-model="password" placeholder="Enter password" />

        <label>Role</label>
        <select v-model="selectedRole">
          <option v-for="r in roles" :key="r">{{ r }}</option>
        </select>

        <label>Global User</label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
          <input type="checkbox" v-model="isGlobal" />
          <span style="font-size:12px; color:var(--text-secondary)">
            Allow on all instances (current + future)
          </span>
        </label>

        <span />
        <div>
          <button
            class="btn btn-primary"
            :disabled="!username.trim() || !password"
            @click="addUser"
            style="width:fit-content"
          >
            Add User
          </button>
          <div v-if="addError" style="font-size:12px; color:#f44336; margin-top:4px">{{ addError }}</div>
        </div>
      </div>
    </div>

    <!-- Users table -->
    <div class="card">
      <div style="font-weight:600; margin-bottom:10px">
        Users with access to this instance
        <button class="btn btn-secondary" style="margin-left:12px; font-size:12px; padding:2px 10px" @click="fetchUsers">↺ Refresh</button>
      </div>

      <div v-if="loading" style="color:var(--text-secondary); padding:12px">Loading…</div>
      <div v-else-if="error" style="color:#f44336; padding:12px">{{ error }}</div>
      <table v-else class="users-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Instance Role</th>
            <th>Global</th>
            <th style="width:100px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.username }}</td>
            <td>{{ user.instanceRole }}</td>
            <td>{{ user.isGlobal ? 'Yes' : 'No' }}</td>
            <td>
              <button class="btn btn-danger" @click="removeUser(user)">Remove</button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="4" style="text-align:center; color:var(--text-secondary); padding:16px">
              No users found
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
