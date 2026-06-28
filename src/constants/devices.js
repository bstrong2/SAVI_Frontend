export const DRIVERS = Object.freeze({
  Relay: 'relay',
  CollisionDetector: 'collision-detector',
  Simulated: 'Simulated',
})

export const DEVICE_TYPES = Object.freeze({
  Com: 'com',
  Ip: 'ip',
})

export const DEVICE_PROPS = Object.freeze({
  DeviceName: 'Device Name',
  ComPort:    'ComPort',
  BaudRate:   'BaudRate',
  IpAddress:  'IpAddress',
  PortNumber: 'PortNumber',
})

// Only used for the dropdown
export const SIMULATED_TYPES = Object.freeze([
  DRIVERS.Relay,
  DRIVERS.CollisionDetector,
])
