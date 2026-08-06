'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Cobranza() {
  const [mes, setMes] = useState('2026-08-01')
  const [cargando, setCargando] = useState(true)
  const [alumnosDelMes, setAlumnosDelMes] = useState([]) // [{id, nombre, clasesReales, exento_pago}]
  const [cobranzas, setCobranzas] = useState([])
  const [cuotasValores, setCuotasValores] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [pagoModal, setPagoModal] = useState(null)
  const [montoForm, setMontoForm] = useState('')
  const [formaForm, setFormaForm] = useState('Efectivo')
  const [cuentaForm, setCuentaForm] = useState(null)
  const [diaPagoForm, setDiaPagoForm] = useState(hoyISO())
  const [cuotasModal, setCuotasModal] = useState(false)
  const [cuotasEdit, setCuotasEdit] = useState({})
  const [filtro, setFiltro] = useState('todos')

  const cargar = useCallback(async () => {
    setCargando(true)

    const { data: insc } = await supabase
      .from('inscripciones')
      .select('alumno_id, alumnos(id, nombre, exento_pago)')
      .eq('mes', mes).eq('estado', 'activo')

    const conteos = {}
    const datosPorId = {}
    ;(insc || []).forEach(i => {
      if (!i.alumnos) return
      conteos[i.alumno_id] = (conteos[i.alumno_id] || 0) + 1
      datosPorId[i.alumno_id] = i.alumnos
    })
    const lista = Object.keys(conteos).map(id => ({
      id, nombre: datosPorId[id].nombre, clasesReales: conteos[id], exento_pago: !!datosPorId[id].exento_pago
    })).sort((a, b) => a.nombre.localeCompare(b.nombre))
    setAlumnosDelMes(lista)

    const { data: cob } = await supabase
      .from('cobranzas').select('*, cuentas(nombre)').eq('mes', mes)
    setCobranzas(cob || [])

    const { data: cv } = await supabase
      .from('cuotas_valores').select('*').order('vigente_desde', { ascending: false })
    const mapa = {}
    ;(cv || []).forEach(v => { if (!(v.clases_semana in mapa)) mapa[v.clases_semana] = v.valor })
    setCuotasValores(mapa)
    setCuotasEdit(mapa)

    const { data: ct } = await supabase.from('cuentas').select('*').order('nombre')
    setCuentas(ct || [])

    setCargando(false)
  }, [mes])

  useEffect(() => { cargar() }, [mes])

  function cambiarMes(delta) {
    const [y, m] = mes.split('-').map(Number)
    const fecha = new Date(y, m - 1 + delta, 1)
    setMes(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`)
  }
  const [anio, mesNum] = mes.split('-').map(Number)
  const labelMes = `${NOMBRES_MES[mesNum - 1]} ${anio}`

  const fechaVencimiento = `${mes.slice(0, 8)}10`

  function cobranzaDe(alumnoId) { return cobranzas.find(c => c.alumno_id === alumnoId) }
  function estaPagado(alumnoId) {
    const c = cobranzaDe(alumnoId)
    return !!(c && Number(c.monto) > 0)
  }
  function estadoDe(alumno) {
    if (alumno.exento_pago) return 'exento'
    if (estaPagado(alumno.id)) return 'pagado'
    return hoyISO() > fechaVencimiento ? 'vencido' : 'pendiente'
  }
  function cuotaEsperada(clasesReales) { return cuotasValores[clasesReales] ?? null }

  const alumnosCobrables = alumnosDelMes.filter(a => !a.exento_pago)
  const proyectado = alumnosCobrables.reduce((acc, a) => acc + (cuotaEsperada(a.clasesReales) || 0), 0)
  const cobradoReal = cobranzas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalEfectivo = cobranzas.filter(c => c.forma_pago === 'Efectivo').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalTransferencia = cobranzas.filter(c => c.forma_pago === 'Transferencia').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const pendientes = alumnosCobrables.filter(a => estadoDe(a) === 'pendiente').length
  const vencidos = alumnosCobrables.filter(a => estadoDe(a) === 'vencido').length

  const transferenciasPorCuenta = cuentas.map(ct => ({
    nombre: ct.nombre,
    total: cobranzas.filter(c => c.forma_pago === 'Transferencia' && c.cuenta_id === ct.id).reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  }))

  const alumnosFiltrados = alumnosDelMes.filter(a => {
    if (filtro === 'todos') return true
    return estadoDe(a) === filtro
  })

  function abrirPago(alumno) {
    const existente = cobranzaDe(alumno.id)
    setPagoModal({ alumno, existente })
    setMontoForm(existente && existente.monto ? String(existente.monto) : String(cuotaEsperada(alumno.clasesReales) || ''))
    setFormaForm(existente?.forma_pago || 'Efectivo')
    setCuentaForm(existente?.cuenta_id || null)
    setDiaPagoForm(existente?.dia_pago || hoyISO())
  }

  async function guardarPago() {
    if (!pagoModal) return
    const payload = {
      alumno_id: pagoModal.alumno.id,
      mes,
      monto: parseFloat(montoForm) || 0,
      forma_pago: formaForm,
      cuenta_id: formaForm === 'Transferencia' ? cuentaForm : null,
      dia_pago: diaPagoForm
    }
    if (pagoModal.existente) {
      await supabase.from('cobranzas').update(payload).eq('id', pagoModal.existente.id)
    } else {
      await supabase.from('cobranzas').insert(payload)
    }
    setPagoModal(null)
    cargar()
  }

  async function borrarPago() {
    if (!pagoModal?.existente) return
    await supabase.from('cobranzas').delete().eq('id', pagoModal.existente.id)
    setPagoModal(null)
    cargar()
  }

  async function guardarCuotas() {
    const hoy = hoyISO()
    const cambios = Object.entries(cuotasEdit).filter(([k, v]) => cuotasValores[k] !== v)
    for (const [clases, valor] of cambios) {
      await supabase.from('cuotas_valores').insert({ clases_semana: parseInt(clases), valor: parseFloat(valor), vigente_desde: hoy })
    }
    setCuotasModal(false)
    cargar()
  }

  const chipEstado = {
    pagado: 'bg-[#5C6F5D] text-white',
    pendiente: 'bg-[#EDE7DD] text-[#8A6B2C]',
    vencido: 'bg-[#B5504A] text-white',
    exento: 'bg-[#E3E3DE] text-[#8A8378]'
  }
  const labelEstado = { pagado: 'Pagado', pendiente: 'Pendiente', vencido: 'Vencido', exento: 'Exento' }

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <nav className="flex gap-4">
          <a href="/" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Días y Horarios</a>
          <a href="/cobranza" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Cobranza</a>
          <a href="/alumnos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Alumnos</a>
        </nav>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">‹</button>
          <span className="text-sm font-medium text-[#221F1B] min-w-[140px] text-center">{labelMes}</span>
          <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">›</button>
        </div>
        <button onClick={() => { setCuotasEdit(cuotasValores); setCuotasModal(true) }} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]">
          Valores de cuota
        </button>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-1">Cobranza</p>
      <p className="text-xs text-[#8A8378] mb-5">Vencimiento del mes: día 10</p>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Proyectado</p>
          <p className="text-xl font-semibold text-[#221F1B]">${proyectado.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Cobrado real</p>
          <p className="text-xl font-semibold text-[#5C6F5D]">${cobradoReal.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Efectivo</p>
          <p className="text-xl font-semibold text-[#221F1B]">${totalEfectivo.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Transferencia</p>
          <p className="text-xl font-semibold text-[#221F1B]">${totalTransferencia.toLocaleString('es-AR')}</p>
          {transferenciasPorCuenta.map(t => (
            <p key={t.nombre} className="text-[10px] text-[#8A8378]">{t.nombre}: ${t.total.toLocaleString('es-AR')}</p>
          ))}
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Pendientes</p>
          <p className="text-xl font-semibold text-[#8A6B2C]">{pendientes}</p>
        </div>
        <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
          <p className="text-xs text-[#8A8378] mb-1">Vencidos</p>
          <p className="text-xl font-semibold text-[#B5504A]">{vencidos}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'pagado', 'pendiente', 'vencido', 'exento'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
            {f === 'todos' ? 'Todos' : labelEstado[f] + 's'}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando cobranza…</p>
      ) : (
        <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Alumno</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Clases/sem</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Cuota</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Estado</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Forma de pago</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Cuenta</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {alumnosFiltrados.map(a => {
                const c = cobranzaDe(a.id)
                const estado = estadoDe(a)
                return (
                  <tr key={a.id} className={`border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9] ${estado === 'vencido' ? 'bg-[#FBEAE8]' : ''}`}>
                    <td className="px-4 py-3 text-sm text-[#221F1B]">{a.nombre}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{a.clasesReales}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {a.exento_pago ? '—' : `$${(cuotaEsperada(a.clasesReales) ?? 0).toLocaleString('es-AR')}`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${chipEstado[estado]}`}>
                        {labelEstado[estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.forma_pago || '—'}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.cuentas?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {!a.exento_pago && (
                        <button onClick={() => abrirPago(a)} className="text-xs text-[#5C6F5D] hover:underline">
                          {estaPagado(a.id) ? 'Editar' : 'Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {alumnosFiltrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagoModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setPagoModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">{pagoModal.alumno.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">{labelMes} · {pagoModal.alumno.clasesReales} clases/semana</p>

            <label className="block text-xs text-[#8A8378] mb-1">Monto pagado</label>
            <input type="number" value={montoForm} onChange={e => setMontoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />

            <label className="block text-xs text-[#8A8378] mb-1">Forma de pago</label>
            <div className="flex gap-2 mb-3">
              {['Efectivo', 'Transferencia'].map(f => (
                <button key={f} onClick={() => setFormaForm(f)} className={`px-4 py-1.5 rounded-full text-sm border ${formaForm === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {f}
                </button>
              ))}
            </div>

            {formaForm === 'Transferencia' && (
              <>
                <label className="block text-xs text-[#8A8378] mb-1">Cuenta destino</label>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {cuentas.map(ct => (
                    <button key={ct.id} onClick={() => setCuentaForm(ct.id)} className={`px-4 py-1.5 rounded-full text-sm border ${cuentaForm === ct.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                      {ct.nombre}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label className="block text-xs text-[#8A8378] mb-1">Día de pago</label>
            <input type="date" value={diaPagoForm} onChange={e => setDiaPagoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#5C6F5D]" />

            <div className="flex gap-3 justify-between items-center">
              {pagoModal.existente ? (
                <button onClick={borrarPago} className="text-xs text-[#B5504A] hover:underline">Eliminar registro</button>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => setPagoModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
                <button onClick={guardarPago} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cuotasModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setCuotasModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Valores de cuota vigentes</p>
            <p className="text-xs text-[#8A8378] mb-4">Al cambiar un valor, se guarda como nuevo vigente desde hoy — el historial de meses anteriores no se altera</p>
            <div className="flex flex-col gap-3 mb-5">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-[#221F1B]">{n} {n === 1 ? 'clase' : 'clases'}/semana</label>
                  <input
                    type="number"
                    value={cuotasEdit[n] ?? ''}
                    onChange={e => setCuotasEdit({ ...cuotasEdit, [n]: e.target.value })}
                    className="w-28 border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] text-right"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCuotasModal(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={guardarCuotas} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}