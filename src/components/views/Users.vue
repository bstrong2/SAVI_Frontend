<script setup>
import { ref } from 'vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5176'

const roles = ['Admin', 'Operator', 'Viewer']

const username     = ref('')
const password     = ref('')
const selectedRole = ref('Operator')

const users = ref([
  { username: 'admin', role: 'Admin' },
])

function addUser() {
  if (!username.value.trim()) return
  users.value.push({ username: username.value.trim(), role: selectedRole.value })
  username.value = ''
  password.value = ''
  selectedRole.value = 'Operator'
}

function removeUser(user) {
  users.value = users.value.filter(u => u !== user)
}
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

        <span />
        <button class="btn btn-primary" @click="addUser" style="justify-self:end; width:fit-content">
          Add User
        </button>
      </div>
    </div>

    <!-- Users table -->
    <div class="card">
      <div style="font-weight:600; margin-bottom:10px">Allowed Users</div>
      <table class="users-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th style="width:100px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(user, i) in users" :key="i">
            <td>{{ user.username }}</td>
            <td>
              <select v-model="user.role">
                <option v-for="r in roles" :key="r">{{ r }}</option>
              </select>
            </td>
            <td>
              <button class="btn btn-danger" @click="removeUser(user)">Remove</button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="3" style="text-align:center; color:var(--text-secondary); padding:16px">
              No users added yet
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
