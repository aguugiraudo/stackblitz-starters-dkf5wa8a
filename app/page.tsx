'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

export default function Grilla() {
  const [horarios, setHorarios] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [alumnosList, setAlumnosList] = useState([])
  const [mes, setMes] = useState('2026-08-01')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data: h } = await supabase
      .from('horarios_clase').select('*').eq('activo', true).order('hora')
    setHorarios(h || [])

    const { data: i } = await supabase
      .from('inscripciones').select('*, alumnos(nombre)')
      .eq('mes', mes).eq('estado', 'activo')
    setInscripciones(i || [])

    const { data: a } = await supabase.from('alumnos').select('id, nombre').order('nombre')
    setAlumnosList(a || [])
    setCargando(false)
  }, [mes])

  useEffect(() => { cargar() }, [mes])

  const horasUnicas = [...new Set(horarios.map(h => h.hora))].sort()

  function getSlot(dia, hora) { return horarios.find(h => h.dia === dia && h.hora === hora) }
  function inscriptosDe(slotId) { return inscripciones.filter(i => i.horario_clase_id === slotId) }

  async function asignar(slotId, alumnoId) {
    await supabase.from('inscripciones').insert({ alumno_id: alumnoId, horario_clase_id: slotId, mes, estado: 'activo' })
    setModal(null); setBusqueda(''); cargar()
  }

  async function crearYAsignar(slotId, nombre) {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return
    const { data: nuevo, error } = await supabase
      .from('alumnos')
      .insert({ nombre: nombreLimpio, clases_semana: 2, estado: 'activo' })
      .select()
      .single()
    if (error) { alert('No se pudo crear el alumno: ' + error.message); return }
    await asignar(slotId, nuevo.id)
  }

  async function quitar(inscripcionId, nombreAlumno) {
    const confirmado = window.confirm(`¿Seguro que querés sacar a ${nombreAlumno} de este horario?`)
    if (!confirmado) return
    await supabase.from('inscripciones').update({ estado: 'baja' }).eq('id', inscripcionId)
    cargar()
  }

  async function mover(inscripcionId, nuevoSlotId) {
    const yaHay = inscriptosDe(nuevoSlotId).length
    const slot = horarios.find(h => h.id === nuevoSlotId)
    if (yaHay >= slot.cupos) { alert('Ese horario ya está completo'); return }
    await supabase.from('inscripciones').update({ horario_clase_id: nuevoSlotId }).eq('id', inscripcionId)
    cargar()
  }

  function onDrop(e, slotId) {
    e.preventDefault()
    const inscripcionId = e.dataTransfer.getData('text/plain')
    if (inscripcionId) mover(inscripcionId, slotId)
  }

  const alumnosFiltrados = alumnosList.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const hayCoincidenciaExacta = alumnosList.some(a => a.nombre.toLowerCase() === busqueda.trim().toLowerCase())

  return (
    <div className="min-h-screen bg-[#F2F3EF] px-6 py-10 md:px-12">
      <header className="mb-8">
        <p className="font-mono text-xs tracking-widest text-[#8B8B82] uppercase mb-1">Romana Pilates</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#2B2B28]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Días y Horarios
        </h1>
      </header>

      {cargando ? (
        <p className="text-[#8B8B82] text-sm">Cargando agenda…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-black/5">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="border-b border-black/5 bg-[#FAFAF8]">
                <th className="text-center px-3 py-3 font-mono text-xs tracking-wider text-[#8B8B82] uppercase w-20">Hora</th>
                {DIAS.map(d => (
                  <th key={d} className="text-center px-3 py-3 text-sm font-semibold text-[#2B2B28] tracking-wide">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horasUnicas.map(hora => (
                <tr key={hora} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-3 font-mono text-sm text-[#2B2B28] text-center align-top">{hora?.slice(0, 5)}</td>
                  {DIAS.map(dia => {
                    const slot = getSlot(dia, hora)
                    if (!slot) return <td key={dia} className="px-3 py-3" />
                    const inscriptos = inscriptosDe(slot.id)
                    const libres = slot.cupos - inscriptos.length
                    return (
                      <td key={dia} className="px-3 py-3 align-top" onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, slot.id)}>
                        <div className="flex flex-col gap-1.5 items-center">
                          {inscriptos.map(i => (
                            <div key={i.id} className="group relative w-full">
                              <span
                                draggable
                                onDragStart={e => e.dataTransfer.setData('text/plain', i.id)}
                                className="cursor-grab active:cursor-grabbing block text-center rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1 truncate"
                                title={i.alumnos?.nombre}
                              >
                                {i.alumnos?.nombre}
                              </span>
                              <button onClick={() => quitar(i.id, i.alumnos?.nombre)} className="hidden group-hover:flex absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B5504A] text-white text-[10px] items-center justify-center" title="Quitar">×</button>
                            </div>
                          ))}
                          {Array.from({ length: libres > 0 ? libres : 0 }).map((_, idx) => (
                            <button key={idx} onClick={() => setModal({ slotId: slot.id })} className="w-full text-center rounded-full border border-dashed border-[#C9CCC5] text-[#B7B9B1] text-xs px-3 py-1 hover:border-[#5C6F5D] hover:text-[#5C6F5D] transition-colors">
                              + Libre
                            </button>
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

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#2B2B28] mb-3">Anotar alumno</p>
            <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar o escribir nombre nuevo…" className="w-full border border-[#E3E3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {alumnosFiltrados.slice(0, 30).map(a => (
                <button key={a.id} onClick={() => asignar(modal.slotId, a.id)} className="text-left text-sm px-3 py-2 rounded-lg hover:bg-[#F2F3EF] text-[#2B2B28]">
                  {a.nombre}
                </button>
              ))}
              {busqueda.trim() && !hayCoincidenciaExacta && (
                <button
                  onClick={() => crearYAsignar(modal.slotId, busqueda)}
                  className="text-left text-sm px-3 py-2 rounded-lg bg-[#F2F3EF] text-[#5C6F5D] font-medium mt-1"
                >
                  + Crear alumno nuevo: "{busqueda.trim()}"
                </button>
              )}
              {alumnosFiltrados.length === 0 && !busqueda.trim() && (
                <p className="text-xs text-[#8B8B82] px-3 py-2">Empezá a escribir para buscar o crear un alumno</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}