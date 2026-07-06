export const LOG_LEVELS = Object.freeze({
  Info: 0,
  Warning: 1,
  Error: 2,
})

export const RUN_STATUS = Object.freeze({
  Idle: 'Idle',
  Running: 'Running',
  Paused: 'Paused',
  Stopped: 'Stopped',
  Logging: 'Logging (No Recipe)',
})

export const CONNECTION_STATUS = Object.freeze({
  Connected: 'Connected',
  Disconnected: 'Disconnected',
  Reconnecting: 'Reconnecting...',
})

export const RUN_COMMANDS = Object.freeze({
  Start: 0,
  LogOnly: 1,
  Pause: 2,
  Resume: 3,
  Stop: 4,
})

export const OTHER_COMMANDS = Object.freeze({
  Login: 0,
  Logout: 1,
  GenerateReport: 2,
})

export const VIEWS = Object.freeze({
  DeviceLayout: 'device-layout',
  LoggingDetails: 'logging-details',
  Recipe: 'recipe',
  Settings: 'settings',
  Users: 'users',
})
