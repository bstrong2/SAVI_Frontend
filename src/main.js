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
      .provide('appConfig',   config)
      .component('font-awesome-icon', FontAwesomeIcon)
      .mount('#app')
  })
