// This is here so we only need to change one location for anywhere in the app that will need all the different roles that
// are available.
export const ALL_ROLES = ['Viewer', 'Operator', 'Admin']

const ROLE_LEVEL = { Viewer: 0, Operator: 1, Admin: 2 }

// Make sure nowhere in the application that we can change what permissions there are. This really should only be changed
// if there is a feature that someone wants that requires a new role to be added. Should never change at runtime.
export const PERMISSIONS = Object.freeze({
  Public: -1, // everyone, even logged out
  AuthRequired: 0, // any logged-in user (Viewer)
  OperatorOnly: 1, // Operator
  AdminOnly: 2, // Admin only
})

// Determine what permission someone has.
export function canAccess(user, permission) {
  // Make sure that they are a user before trying to get the role.
  if (!user) 
    return permission === PERMISSIONS.Public

  return ROLE_LEVEL[user.role] >= permission
}
