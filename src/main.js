import { createApp } from 'vue'
import App from './App.vue'
import './App.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faTableCells,
  faChartLine,
  faClipboardList,
  faGear,
  faUsers,
  faPlay,
  faFilePen,
  faPause,
  faRotateRight,
  faStop,
  faLockOpen,
  faKey,
  faListCheck,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons'

library.add(
  faTableCells,
  faListCheck,
  faChartLine,
  faClipboardList,
  faGear,
  faUsers,
  faPlay,
  faFilePen,
  faPause,
  faRotateRight,
  faStop,
  faLockOpen,
  faKey,
  faSun,
  faMoon,
)

fetch('/config/settings.json')
  .then(res => res.json())
  .then(config => {
    createApp(App)
      .provide('BACKEND_URL', config.backendUrl)
      .component('font-awesome-icon', FontAwesomeIcon)
      .mount('#app')
  })
