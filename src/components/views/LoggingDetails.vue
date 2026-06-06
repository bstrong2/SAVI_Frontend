<script setup>
import { ref, inject, watch, onUnmounted } from 'vue'
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

const connection = inject('connection')

const selectedSensor = ref('Sensor 1')
const sensorList = ref(['Sensor 1', 'Sensor 2', 'Sensor 3'])
const units     = ref('°C')
const ipAddr    = ref('192.168.1.100')
const driver    = ref('ModbusTCP')
const startedBy = ref('')
const startedAt = ref('')
const status    = ref('Idle')

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
  if (sensorId !== selectedSensor.value) return
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
        <select v-model="selectedSensor">
          <option v-for="s in sensorList" :key="s">{{ s }}</option>
        </select>
      </div>
      <div class="form-field">
        <label>Units</label>
        <input type="text" v-model="units" />
      </div>
      <div class="form-field">
        <label>IP Address</label>
        <input type="text" v-model="ipAddr" />
      </div>
      <div class="form-field">
        <label>Driver</label>
        <input type="text" v-model="driver" />
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
        <input type="text" v-model="startedBy" readonly />
      </div>
      <div class="form-field">
        <label>Started At</label>
        <input type="text" v-model="startedAt" readonly />
      </div>
      <div class="form-field">
        <label>Status</label>
        <input type="text" v-model="status" readonly />
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
