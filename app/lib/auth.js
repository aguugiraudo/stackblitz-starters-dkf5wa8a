export const ROLES = { ADMIN: 'admin', PROFE: 'profe' }

const CLAVE_ADMIN = 'ExitoRomana'
const CLAVE_PROFE = 'Romana2026'

export function validarClave(clave) {
  if (clave === CLAVE_ADMIN) return ROLES.ADMIN
  if (clave === CLAVE_PROFE) return ROLES.PROFE
  return null
}

export function getRol() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('romana_rol')
}

export function setRol(rol) {
  localStorage.setItem('romana_rol', rol)
}

export function cerrarSesion() {
  localStorage.removeItem('romana_rol')
}