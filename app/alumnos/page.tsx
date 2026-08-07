'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const SOSPECHOSOS = [
  ['DARIO K', 'DARIO KARCHESKY'],
  ['JOSEFINA BAGNERA15%', 'JOSEFINA BAGNERA'],
  ['ANITA RIVERO15%', 'ANITA RIVERO'],
  ['AGOSTINA TAPIA', 'AGOSTINA TAPIA JUNIO'],
  ['SIRLEY WAGNER', 'SIRLEY WEGNER'],
  ['SOLANA', 'SOLANA BURKET'],
]

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('activo')
  const [editando, setEditando] = useState(null)
  const [viendo, setViendo] = useState(null)
  const [inscripcionesDetalle, setInscripcionesDetalle] = useState([])
  const [fusionAbierta, setFusionAbierta] = useState(false)
  const [buscA, setBuscA] = useState('')
  const [buscB, setBuscB] = useState('')
  const [seleccionA, setSeleccionA] = useState(null)
  const [seleccionB, setSeleccionB] = useState(null)
  const [conteos, setConteos] = useState(null)
  const [survivor, setSurvivor] = useState(null)
  const [sospechososVigentes, setSospechososVigentes] = useState([])
  const [mesStats, setMesStats] = useState('2026-08-01')
  const [anotadosEnMes, setAnotadosEnMes] = useState(null)
  const [clasesPorAlumno, setClasesPorAlumno] = useState({})

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase.from('alumnos').select('*').order('nombre')
    setAlumnos(data || [])
    setCargando(false)

    const vigentes = []
    for (const [n1, n2] of SOSPECHOSOS) {
      const existeA = data?.some(a => a.nombre === n1)
      const existeB = data?.some(a => a.nombre === n2)
      if (existeA && existeB) vigentes.push([n1, n2])
    }
    setSospechososVigentes(vigentes)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarAnotadosEnMes = useCallback(async () => {
    const { data } = await supabase
      .from('inscripciones').select('alumno_id')
      .eq('mes', mesStats).eq('estado', 'activo')
    const conteos = {}
    ;(data || []).forEach(d => { conteos[d.alumno_id] = (conteos[d.alumno_id] || 0) + 1 })
    setClasesPorAlumno(conteos)
    setAnotadosEnMes(Object.keys(conteos).length)
  }, [mesStats])

  useEffect(() => { cargarAnotadosEnMes() }, [cargarAnotadosEnMes])

  function cambiarMesStats(delta) {
    const [y, m] = mesStats.split('-').map(Number)
    const fecha = new Date(y, m - 1 + delta, 1)
    setMesStats(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`)
  }
  const [anioStats, mesNumStats] = mesStats.split('-').map(Number)
  const labelMesStats = `${NOMBRES_MES[mesNumStats - 1]} ${anioStats}`

  const totalHistorico = alumnos.length
  const totalActivos = alumnos.filter(a => a.estado === 'activo').length

  const filtrados = alumnos.filter(a => {
    if (filtro !== 'todos' && a.estado !== filtro) return false
    return a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  async function guardarEdicion() {
    if (!editando) return
    await supabase.from('alumnos').update({
      nombre: editando.nombre,
      estado: editando.estado,
      exento_pago: editando.exento_pago
    }).eq('id', editando.id)
    setEditando(null)
    cargar()
  }

  async function abrirDetalle(alumno) {
    setViendo(alumno)
    const { data } = await supabase
      .from('inscripciones')
      .select('*, horarios_clase(dia, hora)')
      .eq('alumno_id', alumno.id)
      .eq('mes', mesStats)
      .eq('estado', 'activo')
    setInscripcionesDetalle(data || [])
  }

  function abrirFusionCon(nombreA, nombreB) {
    setFusionAbierta(true)
    setBuscA(nombreA); setBuscB(nombreB)
    const a = alumnos.find(x => x.nombre === nombreA)
    const b = alumnos.find(x => x.nombre === nombreB)
    setSeleccionA(a || null); setSeleccionB(b || null)
    setConteos(null); setSurvivor(null)
  }

  async function cargarConteos() {
    if (!seleccionA || !seleccionB) return
    const [insA, cobA, insB, cobB] = await Promise.all([
      supabase.from('inscripciones').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionA.id),
      supabase.from('cobranzas').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionA.id),
      supabase.from('inscripciones').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionB.id),
      supabase.from('cobranzas').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionB.id),
    ])
    setConteos({
      a: { insc: insA.count || 0, cob: cobA.count || 0 },
      b: { insc: insB.count || 0, cob: cobB.count || 0 }
    })
  }

  useEffect(() => { if (seleccionA && seleccionB) cargarConteos() }, [seleccionA, seleccionB])

  async function confirmarFusion() {
    if (!seleccionA || !seleccionB || !survivor) return
    const ganador = survivor === 'a' ? seleccionA : seleccionB
    const perdedor = survivor === 'a' ? seleccionB : seleccionA

    await supabase.from('inscripciones').update({ alumno_id: ganador.id }).eq('alumno_id', perdedor.id)
    await supabase.from('cobranzas').update({ alumno_id: ganador.id }).eq('alumno_id', perdedor.id)
    await supabase.from('alumnos').delete().eq('id', perdedor.id)

    setFusionAbierta(false)
    setSeleccionA(null); setSeleccionB(null); setConteos(null); setSurvivor(null)
    cargar()
  }

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <nav className="flex gap-4 flex-wrap">
          <a href="/dashboard" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Dashboard</a>
          <a href="/" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Días y Horarios</a>
          <a href="/cobranza" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cobranza</a>
          <a href="/gastos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Gastos</a>
          <a href="/finanzas" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Finanzas</a>
          <a href="/alumnos" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Alumnos</a>
        </nav>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-5">Alumnos</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Alumnos históricos</p>
          <p className="text-2xl font-semibold text-[#221F1B]">{totalHistorico}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Alumnos activos hoy</p>
          <p className="text-2xl font-semibold text-[#5C6F5D]">{totalActivos}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-[#8A8378] mb-1">Anotados en un mes</p>
          <div className="flex items-center gap-2">
            <button onClick={() => cambiarMesStats(-1)} className="w-5 h-5 rounded-full bg-[#ECE6DA] flex items-center justify-center text-[#221F1B] text-xs">‹</button>
            <p className="text-2xl font-semibold text-[#221F1B] flex-1 text-center">{anotadosEnMes ?? '—'}</p>
            <button onClick={() => cambiarMesStats(1)} className="w-5 h-5 rounded-full bg-[#ECE6DA] flex items-center justify-center text-[#221F1B] text-xs">›</button>
          </div>
          <p className="text-[10px] text-[#8A8378] text-center mt-1">{labelMesStats}</p>
        </div>
      </div>

      {sospechososVigentes.length > 0 && (
        <div className="mb-6 bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 p-4">
          <p className="text-sm font-medium text-[#221F1B] mb-2">Posibles duplicados detectados</p>
          <div className="flex flex-col gap-2">
            {sospechososVigentes.map(([n1, n2]) => (
              <div key={n1 + n2} className="flex items-center justify-between text-sm">
                <span className="text-[#221F1B]">{n1} <span className="text-[#8A8378]">↔</span> {n2}</span>
                <button onClick={() => abrirFusionCon(n1, n2)} className="text-xs px-3 py-1 rounded-full bg-[#F5F1E9] text-[#5C6F5D] font-medium hover:bg-[#EDE7DD]">
                  Revisar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2">
          {['activo', 'baja', 'todos'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
              {f === 'activo' ? 'Activos' : f === 'baja' ? 'Ex alumnos' : 'Todos'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar alumno…" className="border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] bg-white" />
          <button
            onClick={() => { setFusionAbierta(true); setBuscA(''); setBuscB(''); setSeleccionA(null); setSeleccionB(null); setConteos(null); setSurvivor(null) }}
            className="text-sm px-4 py-1.5 rounded-full bg-white border border-[#221F1B]/15 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]"
          >
            Fusionar alumnos
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando alumnos…</p>
      ) : (
        <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Nombre</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] w-40">Clases/sem ({labelMesStats})</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] w-28">Estado</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(a => (
                <tr key={a.id} className="border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9]">
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => abrirDetalle(a)} className="text-[#221F1B] hover:text-[#5C6F5D] hover:underline text-left">
                      {a.nombre}
                    </button>
                    {a.exento_pago && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[#E3E3DE] text-[#8A8378]">Exento</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{clasesPorAlumno[a.id] ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${a.estado === 'activo' ? 'bg-[#5C6F5D] text-white' : 'bg-[#EDE7DD] text-[#8A8378]'}`}>
                      {a.estado === 'activo' ? 'Activo' : 'Baja'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditando({ ...a })} className="text-xs text-[#5C6F5D] hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viendo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setViendo(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">{viendo.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">
              {clasesPorAlumno[viendo.id] ?? 0} clases/semana en {labelMesStats} · {viendo.estado === 'activo' ? 'Activo' : 'Baja'}
              {viendo.exento_pago ? ' · Exento de pago' : ''}
            </p>
            <p className="text-xs font-medium text-[#8A8378] uppercase tracking-wide mb-2">Horarios en {labelMesStats}</p>
            <div className="flex flex-col gap-1.5 mb-2">
              {inscripcionesDetalle.length > 0 ? inscripcionesDetalle.map(i => (
                <div key={i.id} className="text-sm text-[#221F1B] bg-[#F5F1E9] rounded-lg px-3 py-2">
                  {i.horarios_clase?.dia} — {i.horarios_clase?.hora?.slice(0, 5)}
                </div>
              )) : (
                <p className="text-sm text-[#8A8378]">Sin horarios anotados este mes</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViendo(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-4">Editar alumno</p>
            <label className="block text-xs text-[#8A8378] mb-1">Nombre</label>
            <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />
            <p className="text-xs text-[#8A8378] mb-4">
              Clases por semana: <span className="text-[#221F1B] font-medium">{clasesPorAlumno[editando.id] ?? 0}</span> (se calcula solo desde la grilla, no se edita acá)
            </p>
            <label className="block text-xs text-[#8A8378] mb-1">Estado</label>
            <div className="flex gap-2 mb-4">
              {['activo', 'baja'].map(e => (
                <button key={e} onClick={() => setEditando({ ...editando, estado: e })} className={`px-4 py-1.5 rounded-full text-sm border ${editando.estado === e ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {e === 'activo' ? 'Activo' : 'Baja'}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between bg-[#F5F1E9] rounded-lg px-3 py-2.5 mb-5">
              <div>
                <p className="text-sm text-[#221F1B]">No paga cuota</p>
                <p className="text-[10px] text-[#8A8378]">No entra en la proyección ni figura como pendiente/vencido</p>
              </div>
              <button
                onClick={() => setEditando({ ...editando, exento_pago: !editando.exento_pago })}
                className={`w-11 h-6 rounded-full relative transition-colors ${editando.exento_pago ? 'bg-[#5C6F5D]' : 'bg-[#D8D2C4]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${editando.exento_pago ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={guardarEdicion} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {fusionAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setFusionAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Fusionar alumnos duplicados</p>
            <p className="text-xs text-[#8A8378] mb-4">Elegí los dos registros que son la misma persona</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <input value={buscA} onChange={e => { setBuscA(e.target.value); setSeleccionA(null); setConteos(null) }} placeholder="Buscar alumno A…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]" />
                {!seleccionA && buscA && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscA.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionA(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F5F1E9]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionA && <p className="text-sm font-medium text-[#221F1B]">{seleccionA.nombre}</p>}
              </div>
              <div>
                <input value={buscB} onChange={e => { setBuscB(e.target.value); setSeleccionB(null); setConteos(null) }} placeholder="Buscar alumno B…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]" />
                {!seleccionB && buscB && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscB.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionB(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F5F1E9]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionB && <p className="text-sm font-medium text-[#221F1B]">{seleccionB.nombre}</p>}
              </div>
            </div>

            {seleccionA && seleccionB && conteos && (
              <div className="bg-[#F5F1E9] rounded-lg p-4 mb-4">
                <p className="text-xs text-[#8A8378] mb-3">Elegí cuál registro querés conservar (el otro se elimina y sus datos pasan al que elijas)</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSurvivor('a')} className={`text-left p-3 rounded-lg border ${survivor === 'a' ? 'border-[#5C6F5D] bg-white' : 'border-[#221F1B]/10 bg-white/50'}`}>
                    <p className="text-sm font-medium text-[#221F1B]">{seleccionA.nombre}</p>
                    <p className="text-xs text-[#8A8378] mt-1">{conteos.a.insc} inscripciones · {conteos.a.cob} cobranzas</p>
                  </button>
                  <button onClick={() => setSurvivor('b')} className={`text-left p-3 rounded-lg border ${survivor === 'b' ? 'border-[#5C6F5D] bg-white' : 'border-[#221F1B]/10 bg-white/50'}`}>
                    <p className="text-sm font-medium text-[#221F1B]">{seleccionB.nombre}</p>
                    <p className="text-xs text-[#8A8378] mt-1">{conteos.b.insc} inscripciones · {conteos.b.cob} cobranzas</p>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setFusionAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarFusion} disabled={!survivor} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D] disabled:opacity-40">
                Confirmar fusión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}