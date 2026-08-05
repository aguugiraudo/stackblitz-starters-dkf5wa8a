'use client'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

export default function Grilla() {
  const [horarios, setHorarios] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [mes, setMes] = useState('2026-08-01')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const { data: h } = await supabase
        .from('horarios_clase')
        .select('*')
        .eq('activo', true)
        .order('hora')
      setHorarios(h || [])

      const { data: i } = await supabase
        .from('inscripciones')
        .select('*, alumnos(nombre)')
        .eq('mes', mes)
        .eq('estado', 'activo')
      setInscripciones(i || [])
      setCargando(false)
    }
    cargar()
  }, [mes])

  const horasUnicas = [...new Set(horarios.map(h => h.hora))].sort()

  function alumnosEn(dia, hora) {
    const slot = horarios.find(h => h.dia === dia && h.hora === hora)
    if (!slot) return []
    return inscripciones.filter(i => i.horario_clase_id === slot.id)
  }

  return (
    <div className="min-h-screen bg-[#F2F3EF] px-6 py-10 md:px-12">
      <header className="mb-8">
        <p className="font-mono text-xs tracking-widest text-[#8B8B82] uppercase mb-1">
          Romana Pilates
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#2B2B28]" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
          Días y Horarios
        </h1>
      </header>

      {cargando ? (
        <p className="text-[#8B8B82] text-sm">Cargando agenda…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-black/5">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black/5">
                <th className="text-left px-4 py-3 font-mono text-xs tracking-wider text-[#8B8B82] uppercase w-20">
                  Hora
                </th>
                {DIAS.map(d => (
                  <th key={d} className="text-left px-4 py-3 text-sm font-medium text-[#2B2B28]">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horasUnicas.map(hora => (
                <tr key={hora} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-mono text-sm text-[#2B2B28] align-top">
                    {hora?.slice(0, 5)}
                  </td>
                  {DIAS.map(dia => {
                    const slot = horarios.find(h => h.dia === dia && h.hora === hora)
                    if (!slot) return <td key={dia} className="px-4 py-3" />
                    const inscriptos = alumnosEn(dia, hora)
                    const libres = slot.cupos - inscriptos.length
                    return (
                      <td key={dia} className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          {inscriptos.map(i => (
                            <span
                              key={i.id}
                              className="inline-block rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1 truncate max-w-[140px]"
                            >
                              {i.alumnos?.nombre}
                            </span>
                          ))}
                          {Array.from({ length: libres > 0 ? libres : 0 }).map((_, idx) => (
                            <span
                              key={idx}
                              className="inline-block rounded-full border border-dashed border-[#C9CCC5] text-[#B7B9B1] text-xs px-3 py-1"
                            >
                              Libre
                            </span>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}