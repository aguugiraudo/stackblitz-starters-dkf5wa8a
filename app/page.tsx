'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number)
  const fecha = new Date(y, m - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
}

function formatHoraCorta(hora) {
  const [hh, mm] = hora.split(':')
  return mm === '00' ? String(parseInt(hh, 10)) : `${parseInt(hh, 10)}:${mm}`
}

export default function Grilla() {
  const [horarios, setHorarios] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [alumnosList, setAlumnosList] = useState([])
  const [mes, setMes] = useState('2026-08-01')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [confirmarBaja, setConfirmarBaja] = useState(null)
  const [confirmarMover, setConfirmarMover] = useState(null) // { inscripcionId, nombre, origenDia, origenHora, destinoDia, destinoHora, destinoSlotId }
  const [dispAbierta, setDispAbierta] = useState(false)
  const [camasConsulta, setCamasConsulta] = useState(1)
  const [textoCopiado, setTextoCopiado] = useState(false)

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

  function cambiarMes(delta) {
    const [y, m] = mes.split('-').map(Number)
    const fecha = new Date(y, m - 1 + delta, 1)
    const nuevoMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
    setMes(nuevoMes)
  }

  const [anio, mesNum] = mes.split('-').map(Number)
  const labelMes = `${NOMBRES_MES[mesNum - 1]} ${anio}`
  const mesPrevio = mesAnterior(mes)
  const [anioPrevio, mesNumPrevio] = mesPrevio.split('-').map(Number)
  const labelMesPrevio = `${NOMBRES_MES[mesNumPrevio - 1]} ${anioPrevio}`

  async function copiarMesAnterior() {
    setCopiando(true)
    const { data: prev } = await supabase
      .from('inscripciones').select('alumno_id, horario_clase_id')
      .eq('mes', mesPrevio).eq('estado', 'activo')
    if (prev && prev.length > 0) {
      const nuevas = prev.map(p => ({ alumno_id: p.alumno_id, horario_clase_id: p.horario_clase_id, mes, estado: 'activo' }))
      await supabase.from('inscripciones').insert(nuevas)
    }
    setCopiando(false)
    cargar()
  }

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
      .from('alumnos').insert({ nombre: nombreLimpio, clases_semana: 2, estado: 'activo' }).select().single()
    if (error) { alert('No se pudo crear el alumno: ' + error.message); return }
    await asignar(slotId, nuevo.id)
  }

  async function confirmarQuitar() {
    if (!confirmarBaja) return
    await supabase.from('inscripciones').update({ estado: 'baja' }).eq('id', confirmarBaja.id)
    setConfirmarBaja(null)
    cargar()
  }

  function onDragStartCapsula(e, inscripcion) {
    e.dataTransfer.setData('text/plain', inscripcion.id)
  }

  function onDrop(e, destinoSlot, destinoDia, destinoHora) {
    e.preventDefault()
    const inscripcionId = e.dataTransfer.getData('text/plain')
    if (!inscripcionId) return
    const insc = inscripciones.find(i => i.id === inscripcionId)
    if (!insc) return
    if (insc.horario_clase_id === destinoSlot.id) return // soltó en el mismo lugar

    const yaHay = inscriptosDe(destinoSlot.id).length
    if (yaHay >= destinoSlot.cupos) { alert('Ese horario ya está completo'); return }

    const origen = horarios.find(h => h.id === insc.horario_clase_id)
    setConfirmarMover({
      inscripcionId,
      nombre: insc.alumnos?.nombre,
      origenDia: origen?.dia, origenHora: origen?.hora?.slice(0, 5),
      destinoDia, destinoHora: destinoHora.slice(0, 5),
      destinoSlotId: destinoSlot.id
    })
  }

  async function confirmarMoverAhora() {
    if (!confirmarMover) return
    await supabase.from('inscripciones').update({ horario_clase_id: confirmarMover.destinoSlotId }).eq('id', confirmarMover.inscripcionId)
    setConfirmarMover(null)
    cargar()
  }

  const alumnosFiltrados = alumnosList.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const hayCoincidenciaExacta = alumnosList.some(a => a.nombre.toLowerCase() === busqueda.trim().toLowerCase())
  const mesVacio = !cargando && inscripciones.length === 0

  const bloquesPorDia = DIAS.map(dia => {
    const horasLibres = horasUnicas
      .filter(hora => {
        const slot = getSlot(dia, hora)
        if (!slot) return false
        const libres = slot.cupos - inscriptosDe(slot.id).length
        return libres >= camasConsulta
      })
      .map(formatHoraCorta)
    return { dia, horasLibres }
  }).filter(b => b.horasLibres.length > 0)

  const encabezadoMensaje = camasConsulta === 1
    ? 'Te comparto los horarios disponibles 🕧'
    : `Te comparto los horarios con disponibilidad para ${camasConsulta} personas simultáneas 🕧`

  const mensajeWhatsapp = bloquesPorDia.length > 0
    ? `${encabezadoMensaje}\n\n${bloquesPorDia.map(b => `${b.dia} ${b.horasLibres.join(' / ')}`).join('\n')}`
    : `${encabezadoMensaje}\n\nNo hay horarios disponibles por el momento.`

  async function copiarMensaje() {
    try {
      await navigator.clipboard.writeText(mensajeWhatsapp)
      setTextoCopiado(true)
      setTimeout(() => setTextoCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar automáticamente, seleccioná el texto manualmente.')
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F3EF] px-6 py-10 md:px-12">
      <header className="mb-6">
        <p className="font-mono text-xs tracking-widest text-[#8B8B82] uppercase mb-1">Romana Pilates</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#2B2B28]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Días y Horarios
        </h1>
      </header>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center text-[#2B2B28] hover:bg-[#F2F3EF]">‹</button>
          <span className="text-sm font-medium text-[#2B2B28] min-w-[140px] text-center">{labelMes}</span>
          <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center text-[#2B2B28] hover:bg-[#F2F3EF]">›</button>
        </div>
        <button onClick={() => setDispAbierta(true)} className="text-sm px-4 py-2 rounded-full bg-white border border-black/10 text-[#2B2B28] hover:border-[#5C6F5D] hover:text-[#5C6F5D] flex items-center gap-2">
          <span>🕧</span> Disponibilidad
        </button>
      </div>

      {mesVacio && (
        <div className="mb-6">
          <button onClick={copiarMesAnterior} disabled={copiando} className="text-sm px-4 py-2 rounded-full bg-[#5C6F5D] text-white hover:bg-[#4C5C4D] disabled:opacity-60">
            {copiando ? 'Copiando…' : `Copiar inscripciones de ${labelMesPrevio}`}
          </button>
        </div>
      )}

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
                      <td key={dia} className="px-3 py-3 align-top" onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, slot, dia, hora)}>
                        <div className="flex flex-col gap-1.5 items-center">
                          {inscriptos.map(i => (
                            <div key={i.id} className="group relative w-full">
                              <span
                                draggable
                                onDragStart={e => onDragStartCapsula(e, i)}
                                className="cursor-grab active:cursor-grabbing block text-center rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1 truncate"
                                title={i.alumnos?.nombre}
                              >
                                {i.alumnos?.nombre}
                              </span>
                              <button
                                onClick={() => setConfirmarBaja({ id: i.id, nombre: i.alumnos?.nombre })}
                                className="hidden group-hover:flex absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B5504A] text-white text-[10px] items-center justify-center"
                                title="Quitar"
                              >
                                ×
                              </button>
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
                <button onClick={() => crearYAsignar(modal.slotId, busqueda)} className="text-left text-sm px-3 py-2 rounded-lg bg-[#F2F3EF] text-[#5C6F5D] font-medium mt-1">
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

      {confirmarBaja && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBaja(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#2B2B28] mb-6">
              ¿Seguro que querés sacar a <span className="font-semibold">{confirmarBaja.nombre}</span> de este horario?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBaja(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#2B2B28] border border-black/10 hover:bg-[#F2F3EF]">Cancelar</button>
              <button onClick={confirmarQuitar} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Sacar del horario</button>
            </div>
          </div>
        </div>
      )}

      {confirmarMover && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarMover(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#2B2B28] mb-6">
              ¿Deseás cambiar a <span className="font-semibold">{confirmarMover.nombre}</span> de{' '}
              <span className="font-semibold">{confirmarMover.origenDia} {confirmarMover.origenHora}</span> a{' '}
              <span className="font-semibold">{confirmarMover.destinoDia} {confirmarMover.destinoHora}</span>?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarMover(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#2B2B28] border border-black/10 hover:bg-[#F2F3EF]">Cancelar</button>
              <button onClick={confirmarMoverAhora} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Confirmar cambio</button>
            </div>
          </div>
        </div>
      )}

      {dispAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setDispAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#2B2B28] mb-1">Disponibilidad — {labelMes}</p>
            <p className="text-xs text-[#8B8B82] mb-4">Elegí para cuántas camas consultás</p>
            <div className="flex gap-2 mb-4">
              {[1, 2].map(n => (
                <button key={n} onClick={() => setCamasConsulta(n)} className={`px-4 py-1.5 rounded-full text-sm border ${camasConsulta === n ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#2B2B28] border-black/10 hover:border-[#5C6F5D]'}`}>
                  {n === 1 ? '1 cama' : '2 camas'}
                </button>
              ))}
            </div>
            <div className="bg-[#F2F3EF] rounded-lg p-4 mb-4 whitespace-pre-line text-sm text-[#2B2B28] max-h-64 overflow-y-auto">
              {mensajeWhatsapp}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDispAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#2B2B28] border border-black/10 hover:bg-[#F2F3EF]">Cerrar</button>
              <button onClick={copiarMensaje} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
                {textoCopiado ? '✓ Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}