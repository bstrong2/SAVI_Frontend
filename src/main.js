import { createApp } from 'vue'
import App from './App.vue'
import './App.css'
import { COLORS } from './constants/colors.js'

for (const [name, value] of Object.entries(COLORS)) {
  document.documentElement.style.setProperty(`--color-${name}`, value)
}

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
  faRotateLeft,
  faStop,
  faLockOpen,
  faKey,
  faListCheck,
  faSun,
  faMoon,
  faFloppyDisk,
  faFolderOpen,
  faLink,
  faPlug,
  faNetworkWired,
  faTrash,
  faPen,
  faCheck,
  faAlignLeft,
  faAlignCenter,
  faAlignRight,
  faTriangleExclamation,
  faXmark,
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
  faRotateLeft,
  faStop,
  faLockOpen,
  faKey,
  faSun,
  faMoon,
  faFloppyDisk,
  faFolderOpen,
  faLink,
  faPlug,
  faNetworkWired,
  faTrash,
  faPen,
  faCheck,
  faAlignLeft,
  faAlignCenter,
  faAlignRight,
  faTriangleExclamation,
  faXmark,
)

fetch('/config/settings.json')
  .then(res => res.json())
  .then(config => {
    createApp(App)
      .provide('BACKEND_URL', config.backendUrl)
      .component('font-awesome-icon', FontAwesomeIcon)
      .mount('#app')
  })
