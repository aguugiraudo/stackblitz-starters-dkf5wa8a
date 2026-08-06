'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
  const [filtro, setFiltro] = useState('activo') // activo | baja | todos
  const [editando, setEditando] = useState(null) // alumno seleccionado
  const [fusionAbierta, setFusionAbierta] = useState(false)
  const [buscA, setBuscA] = useState('')
  const [buscB, setBuscB] = useState('')
  const [seleccionA, setSeleccionA] = useState(null)
  const [seleccionB, setSeleccionB] = useState(null)
  const [conteos, setConteos] = useState(null) // { a: {insc, cob}, b: {...} }
  const [survivor, setSurvivor] = useState(null) // 'a' | 'b'
  const [sospechososVigentes, setSospechososVigentes] = useState([])

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

  useEffect(() => { cargar() }, [])

  const filtrados = alumnos.filter(a => {
    if (filtro !== 'todos' && a.estado !== filtro) return false
    return a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  async function guardarEdicion() {
    if (!editando) return
    await supabase.from('alumnos').update({
      nombre: editando.nombre,
      clases_semana: editando.clases_semana,
      estado: editando.estado
    }).eq('id', editando.id)
    setEditando(null)
    cargar()
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
    <div className="min-h-screen bg-[#F2F3EF] px-6 py-10 md:px-12">
      <header className="mb-6">
        <p className="font-mono text-xs tracking-widest text-[#8B8B82] uppercase mb-1">Romana Pilates</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-[#2B2B28]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Alumnos
        </h1>
        <nav className="flex gap-4 mt-3">
          <a href="/" className="text-sm font-medium text-[#8B8B82] hover:text-[#2B2B28]">Días y Horarios</a>
          <a href="/alumnos" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Alumnos</a>
        </nav>
      </header>

      {sospechososVigentes.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-black/5 p-4">
          <p className="text-sm font-medium text-[#2B2B28] mb-2">Posibles duplicados detectados</p>
          <div className="flex flex-col gap-2">
            {sospechososVigentes.map(([n1, n2]) => (
              <div key={n1 + n2} className="flex items-center justify-between text-sm">
                <span className="text-[#2B2B28]">{n1} <span className="text-[#8B8B82]">↔</span> {n2}</span>
                <button
                  onClick={() => abrirFusionCon(n1, n2)}
                  className="text-xs px-3 py-1 rounded-full bg-[#F2F3EF] text-[#5C6F5D] font-medium hover:bg-[#E7E9E3]"
                >
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
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#2B2B28] border-black/10 hover:border-[#5C6F5D]'}`}
            >
              {f === 'activo' ? 'Activos' : f === 'baja' ? 'Ex alumnos' : 'Todos'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar alumno…"
            className="border border-[#E3E3DE] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] bg-white"
          />
          <button
            onClick={() => { setFusionAbierta(true); setBuscA(''); setBuscB(''); setSeleccionA(null); setSeleccionB(null); setConteos(null); setSurvivor(null) }}
            className="text-sm px-4 py-1.5 rounded-full bg-white border border-black/10 text-[#2B2B28] hover:border-[#5C6F5D] hover:text-[#5C6F5D]"
          >
            Fusionar alumnos
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="text-[#8B8B82] text-sm">Cargando alumnos…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black/5 bg-[#FAFAF8]">
                <th className="text-left px-4 py-3 text-sm font-semibold text-[#2B2B28]">Nombre</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#2B2B28] w-32">Clases/sem</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#2B2B28] w-28">Estado</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(a => (
                <tr key={a.id} className="border-b border-black/5 last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-4 py-3 text-sm text-[#2B2B28]">{a.nombre}</td>
                  <td className="px-4 py-3 text-sm text-center text-[#2B2B28]">{a.clases_semana}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${a.estado === 'activo' ? 'bg-[#5C6F5D] text-white' : 'bg-[#E3E3DE] text-[#8B8B82]'}`}>
                      {a.estado === 'activo' ? 'Activo' : 'Baja'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setEditando({ ...a })} className="text-xs text-[#5C6F5D] hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-[#8B8B82]">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#2B2B28] mb-4">Editar alumno</p>
            <label className="block text-xs text-[#8B8B82] mb-1">Nombre</label>
            <input
              value={editando.nombre}
              onChange={e => setEditando({ ...editando, nombre: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]"
            />
            <label className="block text-xs text-[#8B8B82] mb-1">Clases por semana</label>
            <input
              type="number" min={1} max={7}
              value={editando.clases_semana}
              onChange={e => setEditando({ ...editando, clases_semana: parseInt(e.target.value) || 1 })}
              className="w-full border border-[#E3E3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]"
            />
            <label className="block text-xs text-[#8B8B82] mb-1">Estado</label>
            <div className="flex gap-2 mb-5">
              {['activo', 'baja'].map(e => (
                <button
                  key={e}
                  onClick={() => setEditando({ ...editando, estado: e })}
                  className={`px-4 py-1.5 rounded-full text-sm border ${editando.estado === e ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#2B2B28] border-black/10'}`}
                >
                  {e === 'activo' ? 'Activo' : 'Baja'}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#2B2B28] border border-black/10 hover:bg-[#F2F3EF]">Cancelar</button>
              <button onClick={guardarEdicion} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {fusionAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setFusionAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#2B2B28] mb-1">Fusionar alumnos duplicados</p>
            <p className="text-xs text-[#8B8B82] mb-4">Elegí los dos registros que son la misma persona</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <input
                  value={buscA}
                  onChange={e => { setBuscA(e.target.value); setSeleccionA(null); setConteos(null) }}
                  placeholder="Buscar alumno A…"
                  className="w-full border border-[#E3E3DE] rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]"
                />
                {!seleccionA && buscA && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscA.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionA(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F2F3EF]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionA && <p className="text-sm font-medium text-[#2B2B28]">{seleccionA.nombre}</p>}
              </div>
              <div>
                <input
                  value={buscB}
                  onChange={e => { setBuscB(e.target.value); setSeleccionB(null); setConteos(null) }}
                  placeholder="Buscar alumno B…"
                  className="w-full border border-[#E3E3DE] rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]"
                />
                {!seleccionB && buscB && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscB.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionB(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F2F3EF]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionB && <p className="text-sm font-medium text-[#2B2B28]">{seleccionB.nombre}</p>}
              </div>
            </div>

            {seleccionA && seleccionB && conteos && (
              <div className="bg-[#F2F3EF] rounded-lg p-4 mb-4">
                <p className="text-xs text-[#8B8B82] mb-3">Elegí cuál registro querés conservar (el otro se elimina y sus datos pasan al que elijas)</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSurvivor('a')}
                    className={`text-left p-3 rounded-lg border ${survivor === 'a' ? 'border-[#5C6F5D] bg-white' : 'border-black/10 bg-white/50'}`}
                  >
                    <p className="text-sm font-medium text-[#2B2B28]">{seleccionA.nombre}</p>
                    <p className="text-xs text-[#8B8B82] mt-1">{conteos.a.insc} inscripciones · {conteos.a.cob} cobranzas</p>
                  </button>
                  <button
                    onClick={() => setSurvivor('b')}
                    className={`text-left p-3 rounded-lg border ${survivor === 'b' ? 'border-[#5C6F5D] bg-white' : 'border-black/10 bg-white/50'}`}
                  >
                    <p className="text-sm font-medium text-[#2B2B28]">{seleccionB.nombre}</p>
                    <p className="text-xs text-[#8B8B82] mt-1">{conteos.b.insc} inscripciones · {conteos.b.cob} cobranzas</p>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setFusionAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#2B2B28] border border-black/10 hover:bg-[#F2F3EF]">Cancelar</button>
              <button
                onClick={confirmarFusion}
                disabled={!survivor}
                className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D] disabled:opacity-40"
              >
                Confirmar fusión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}