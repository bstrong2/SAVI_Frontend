import { describe, it, expect } from 'vitest'
import { canAccess, PERMISSIONS } from './roles.js'

describe('canAccess', () => {
  const viewer = { role: 'Viewer' }
  const operator = { role: 'Operator' }
  const admin = { role: 'Admin' }

  // Test that an anonymous (null) user can only access Public content.
  it('lets logged-out users reach only Public content', () => {
    expect(canAccess(null, PERMISSIONS.Public)).toBe(true)
    expect(canAccess(null, PERMISSIONS.AuthRequired)).toBe(false)
    expect(canAccess(null, PERMISSIONS.OperatorOnly)).toBe(false)
    expect(canAccess(null, PERMISSIONS.AdminOnly)).toBe(false)
  })

  // Test that any authenticated role, regardless of level, satisfies AuthRequired.
  it('grants any logged-in user AuthRequired access', () => {
    expect(canAccess(viewer, PERMISSIONS.AuthRequired)).toBe(true)
    expect(canAccess(operator, PERMISSIONS.AuthRequired)).toBe(true)
    expect(canAccess(admin, PERMISSIONS.AuthRequired)).toBe(true)
  })

  // Test that OperatorOnly requires at least the Operator role.
  it('gates OperatorOnly to Operator and above', () => {
    expect(canAccess(viewer, PERMISSIONS.OperatorOnly)).toBe(false)
    expect(canAccess(operator, PERMISSIONS.OperatorOnly)).toBe(true)
    expect(canAccess(admin, PERMISSIONS.OperatorOnly)).toBe(true)
  })

  // Test that AdminOnly requires the Admin role specifically.
  it('gates AdminOnly to Admin only', () => {
    expect(canAccess(viewer, PERMISSIONS.AdminOnly)).toBe(false)
    expect(canAccess(operator, PERMISSIONS.AdminOnly)).toBe(false)
    expect(canAccess(admin, PERMISSIONS.AdminOnly)).toBe(true)
  })

  // Test that a higher privileged role can still access Public content.
  it('treats a logged-in user as able to view Public content', () => {
    expect(canAccess(viewer, PERMISSIONS.Public)).toBe(true)
  })
})
