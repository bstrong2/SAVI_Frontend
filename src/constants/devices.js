export const ITEM_TYPES = Object.freeze({
  Sensor: 'sensor',
  Rect: 'rect',
})

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
  ComPort: 'ComPort',
  BaudRate: 'BaudRate',
  IpAddress: 'IpAddress',
  PortNumber: 'PortNumber',
})

// Only used for the dropdown
export const SIMULATED_TYPES = Object.freeze([
  DRIVERS.Relay,
  DRIVERS.CollisionDetector,
])

export const DRIVER_DEFAULTS = Object.freeze({
  [DRIVERS.Relay]: { relayState: 'off' },
  [DRIVERS.CollisionDetector]: { value: 'No Contact', unit: '' },
})

export const PICKER_TYPES = Object.freeze({
  BackgroundColor: 'Background Color',
  Text: 'Text',
})
