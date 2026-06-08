<script setup>
import { ref, computed, inject, watch, onUnmounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const connection  = inject('connection')
const layoutItems = inject('layoutItems')
const runInfo     = inject('runInfo')

// Only sensors placed on the Device Layout canvas
const sensorList = computed(() =>
  (layoutItems?.value ?? []).filter(i => i.type === 'sensor')
)

const selectedSensorId = ref(null)

// Keep selection valid: auto-select first sensor when list changes
watch(sensorList, (list) => {
  if (!list.find(s => s.id === selectedSensorId.value)) {
    selectedSensorId.value = list[0]?.id ?? null
  }
}, { immediate: true })

const selectedSensorObj = computed(() =>
  sensorList.value.find(s => s.id === selectedSensorId.value) ?? null
)

// Detail fields — derived from the selected sensor
const units     = computed(() => selectedSensorObj.value?.unit       ?? '—')
const ipAddr    = computed(() => selectedSensorObj.value?.connection ?? '—')
const driver    = computed(() => selectedSensorObj.value?.driver     ?? '—')

// Right-panel fields — derived from runInfo provided by App.vue
const startedBy = computed(() => runInfo?.value?.startedBy ?? '—')
const startedAt = computed(() => runInfo?.value?.startedAt ?? '—')
const status    = computed(() => runInfo?.value?.status    ?? 'Idle')

const MAX_POINTS = 60

const chartData = ref({
  labels: [],
  datasets: [{
    label: 'Sensor Value',
    data: [],
    borderColor: '#007ACC',
    backgroundColor: 'rgba(0, 122, 204, 0.08)',
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 2,
    fill: true,
  }],
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
    y: { beginAtZero: false, ticks: { font: { size: 10 } } },
  },
}

function handleSensorUpdate(sensorId, value) {
  if (sensorId !== selectedSensorId.value) return
  const labels = chartData.value.labels
  const data   = chartData.value.datasets[0].data
  labels.push(new Date().toLocaleTimeString())
  data.push(value)
  if (labels.length > MAX_POINTS) { labels.shift(); data.shift() }
  chartData.value = { ...chartData.value }
}

watch(connection, (conn, prevConn) => {
  prevConn?.off('SensorUpdate', handleSensorUpdate)
  conn?.on('SensorUpdate', handleSensorUpdate)
}, { immediate: true })

onUnmounted(() => {
  connection?.value?.off('SensorUpdate', handleSensorUpdate)
})
</script>

<template>
  <div class="logging-details">
    <!-- Left panel -->
    <div class="details-left">
      <div class="form-field">
        <label>Sensor</label>
        <select v-model="selectedSensorId">
          <option v-if="sensorList.length === 0" :value="null" disabled>No sensors on canvas</option>
          <option v-for="s in sensorList" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="form-field">
        <label>Units</label>
        <input type="text" :value="units" readonly />
      </div>
      <div class="form-field">
        <label>Connection</label>
        <input type="text" :value="ipAddr" readonly />
      </div>
      <div class="form-field">
        <label>Driver</label>
        <input type="text" :value="driver" readonly />
      </div>
    </div>

    <!-- Center: chart -->
    <div class="details-center">
      <div class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <div v-if="chartData.datasets[0].data.length === 0" class="chart-empty">
        No data — waiting for sensor updates via SignalR
      </div>
    </div>

    <!-- Right panel -->
    <div class="details-right">
      <div class="form-field">
        <label>Started By</label>
        <input type="text" :value="startedBy" readonly />
      </div>
      <div class="form-field">
        <label>Started At</label>
        <input type="text" :value="startedAt" readonly />
      </div>
      <div class="form-field">
        <label>Status</label>
        <input type="text" :value="status" readonly />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 12px;
  pointer-events: none;
}
</style>
