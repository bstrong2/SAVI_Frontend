<script setup>
  import { ref, inject, onMounted } from 'vue'
  import { ALL_ROLES } from '../../auth/roles.js'


  /////////////////////////////////////////////
  // Define variables.
  const roles = ALL_ROLES
  const username = ref('')
  const password = ref('')
  const selectedRole = ref('Operator')
  const isGlobal = ref(false)
  const users = ref([])
  const loading = ref(false)
  const error = ref('')
  const addError = ref('')

  // Inject needed data for this view.
  const BACKEND_URL = inject('BACKEND_URL')
  const authToken = inject('authToken')
  const pendingRoles = ref({})


  /////////////////////////////////////////////
  // Defining all functions.
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken?.value ?? ''}`,
    }
  }

  async function fetchUsers() {
    loading.value = true
    error.value = ''
    pendingRoles.value = {}
    try {
      const response = await fetch(`${BACKEND_URL}/api/users`, { headers: authHeaders() })
      if (!response.ok) 
        throw new Error(`HTTP ${response.status}`)
      users.value = await response.json()
    } catch (e) {
      error.value = `Failed to load users: ${e.message}`
    } finally {
      loading.value = false
    }
  }

  async function addUser() {

    if (!username.value.trim() || !password.value) 
      return

    addError.value = ''
    try {
      const response = await fetch(`${BACKEND_URL}/api/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          username: username.value.trim(),
          password: password.value,
          role: selectedRole.value,
          isGlobal: isGlobal.value,
        }),
      })
      if (response.status === 409) {
        addError.value = 'Username already exists.'
        return
      }
      if (!response.ok) 
        throw new Error(`HTTP ${response.status}`)

      username.value = ''
      password.value = ''
      selectedRole.value = 'Operator'
      isGlobal.value = false
      await fetchUsers()
    } catch (e) {
      addError.value = `Failed to add user: ${e.message}`
    }
  }

  // Called when the dropdown changes — just stages the new value, doesn't save yet.
  function onRoleChange(user, newRole) {

    if (newRole === user.instanceRole) {

      const updated = { ...pendingRoles.value }
      delete updated[user.id]
      pendingRoles.value = updated
    } else {
      pendingRoles.value = { ...pendingRoles.value, [user.id]: newRole }
    }
  }

  // Discard the staged change without saving.
  function cancelRoleEdit(user) {
    const updated = { ...pendingRoles.value }
    delete updated[user.id]
    pendingRoles.value = updated
  }

  // Confirm and send the staged role to the backend.
  async function confirmRoleUpdate(user) {
    const newRole = pendingRoles.value[user.id]

    if (!newRole || newRole === user.instanceRole) 
      return

    error.value = ''
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ role: newRole }),
      })
      if (!response.ok) 
        throw new Error(`HTTP ${response.status}`)

      user.instanceRole = newRole
      cancelRoleEdit(user)
    } catch (e) {
      error.value = `Failed to update role: ${e.message}`
    }
  }

  async function removeUser(user) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/${user.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!response.ok) 
        throw new Error(`HTTP ${response.status}`)
      
      await fetchUsers()
    } catch (e) {
      error.value = `Failed to remove user: ${e.message}`
    }
  }

  /////////////////////////////////////////////
  // Mounts
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
          <button class="btn btn-primary" :disabled="!username.trim() || !password" @click="addUser" style="width:fit-content">
            Add User
          </button>
          <div v-if="addError" style="font-size:12px; color:var(--color-red); margin-top:4px">{{ addError }}</div>
        </div>
      </div>
    </div>

    <!-- Users table -->
    <div class="card">
      <div style="font-weight:600; margin-bottom:10px">
        Users with access to this instance
        <button class="btn btn-secondary" style="margin-left:12px; font-size:12px; padding:2px 10px" @click="fetchUsers"><font-awesome-icon icon="rotate-right" style="color: var(--accent)" /> Refresh</button>
      </div>

      <div v-if="loading" style="color:var(--text-secondary); padding:12px">Loading…</div>
      <div v-else-if="error" style="color:var(--color-red); padding:12px">{{ error }}</div>
      <table v-else class="users-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Instance Role</th>
            <th>Global</th>
            <th style="width:120px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" :class="{ 'row-dirty': !!pendingRoles[user.id] }">
            <td>{{ user.username }}</td>
            <td>
              <div class="role-cell">
                <select class="role-select" :value="pendingRoles[user.id] ?? user.instanceRole" @change="onRoleChange(user, $event.target.value)">
                  <option v-for="r in roles" :key="r">{{ r }}</option>
                </select>
                <template v-if="pendingRoles[user.id]">
                  <button class="btn btn-primary btn-xs" @click="confirmRoleUpdate(user)">Update</button>
                  <button class="btn btn-secondary btn-xs" @click="cancelRoleEdit(user)" title="Cancel"><font-awesome-icon icon="xmark" style="color: var(--color-darkRed)" /></button>
                </template>
              </div>
            </td>
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

<style scoped>
  .role-cell {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role-select {
    font-size: 13px;
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-input, var(--bg-panel));
    color: var(--text-primary);
    cursor: pointer;
  }

  .role-select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .btn-xs {
    font-size: 11px;
    padding: 2px 7px;
    line-height: 1.4;
  }

  .row-dirty td {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  .card {
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 20px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }

  .users-view {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    height: 100%;
    overflow-y: auto;
  }

  .users-view h2 {
    margin: 0 0 16px;
    font-size: 18px;
    color: var(--text-primary);
  }


  .add-user-form {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 8px 12px;
    align-items: center;
    max-width: 480px;
  }
  .add-user-form label { font-size: 13px; color: var(--text-secondary); }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .users-table th {
    background: var(--bg-table-header);
    text-align: left;
    padding: 7px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color);
  }
  .users-table td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-color);
    vertical-align: middle;
  }

  .users-table tr:nth-child(even) td { 
    background: var(--bg-table-alt); 
  }
  .users-table tr:hover td {
     background: var(--bg-table-hover); 
    }

  .users-table select { width: auto; }
</style>
