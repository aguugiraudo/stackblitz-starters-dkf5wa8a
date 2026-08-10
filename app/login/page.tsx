'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validarClave, setRol } from '../lib/auth'

export default function Login() {
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  function ingresar() {
    const rol = validarClave(clave)
    if (!rol) { setError('Clave incorrecta'); return }
    setRol(rol)
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-[#ECE6DA] flex items-center justify-center px-4">
      <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-8 w-full max-w-sm text-center">
        <p className="text-3xl text-[#221F1B] mb-6" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Romana Studio</p>
        <input
          type="password"
          value={clave}
          onChange={e => setClave(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ingresar()}
          placeholder="Clave de acceso"
          autoFocus
          className="w-full border border-[#221F1B]/15 rounded-lg px-4 py-3 text-center text-sm mb-3 outline-none focus:border-[#5C6F5D]"
        />
        {error && <p className="text-xs text-[#B5504A] mb-3">{error}</p>}
        <button onClick={ingresar} className="w-full px-4 py-3 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
          Ingresar
        </button>
      </div>
    </div>
  )
}