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
  const [alumnosDelMes, setAlumnosDelMes] = useState([])
  const [cobranzas, setCobranzas] = useState([])
  const [cuotasValores, setCuotasValores] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [pagoModal, setPagoModal] = useState(null)
  const [montoForm, setMontoForm] = useState('')
  const [montoEsperadoForm, setMontoEsperadoForm] = useState('')
  const [formaForm, setFormaForm] = useState('Efectivo')
  const [cuentaForm, setCuentaForm] = useState(null)
  const [diaPagoForm, setDiaPagoForm] = useState(hoyISO())
  const [cuotasModal, setCuotasModal] = useState(false)
  const [cuotasEdit, setCuotasEdit] = useState({})
  const [filtro, setFiltro] = useState('todos')
  const [mensajeModal, setMensajeModal] = useState(null)
  const [cuentaMensajeId, setCuentaMensajeId] = useState(null)
  const [tipoMensaje, setTipoMensaje] = useState('recordatorio')
  const [copiado, setCopiado] = useState(false)

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
    if (ct && ct.length > 0 && !cuentaMensajeId) setCuentaMensajeId(ct[0].id)

    setCargando(false)
  }, [mes])

  useEffect(() => { cargar() }, [cargar])

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
  function cuotaBase(clasesReales) { return cuotasValores[clasesReales] ?? 0 }
  function cuotaEsperada(alumno) {
    const c = cobranzaDe(alumno.id)
    if (c && c.monto_esperado !== null && c.monto_esperado !== undefined) return Number(c.monto_esperado)
    return cuotaBase(alumno.clasesReales)
  }

  const alumnosCobrables = alumnosDelMes.filter(a => !a.exento_pago)
  const proyectado = alumnosCobrables.reduce((acc, a) => acc + cuotaEsperada(a), 0)
  const cobradoReal = cobranzas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalEfectivo = cobranzas.filter(c => c.forma_pago === 'Efectivo').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalTransferencia = cobranzas.filter(c => c.forma_pago === 'Transferencia').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const pendienteCobrar = proyectado - cobradoReal
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
    setMontoForm(existente && existente.monto ? String(existente.monto) : '')
    setMontoEsperadoForm(String(cuotaEsperada(alumno)))
    setFormaForm(existente?.forma_pago || 'Efectivo')
    setCuentaForm(existente?.cuenta_id || null)
    setDiaPagoForm(existente?.dia_pago || hoyISO())
  }

  async function guardarPago() {
    if (!pagoModal) return
    const montoPagado = parseFloat(montoForm) || 0
    const payload = {
      alumno_id: pagoModal.alumno.id,
      mes,
      monto: montoPagado,
      monto_esperado: montoEsperadoForm === '' ? null : parseFloat(montoEsperadoForm),
      forma_pago: montoPagado > 0 ? formaForm : null,
      cuenta_id: montoPagado > 0 && formaForm === 'Transferencia' ? cuentaForm : null,
      dia_pago: montoPagado > 0 ? diaPagoForm : null
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

  function abrirMensaje(alumno) {
    setMensajeModal(alumno)
    setTipoMensaje(estadoDe(alumno) === 'vencido' ? 'vencido' : 'recordatorio')
    setCopiado(false)
  }

  function textoMensaje() {
    if (!mensajeModal) return ''
    const cuenta = cuentas.find(c => c.id === cuentaMensajeId)
    const monto = cuotaEsperada(mensajeModal).toLocaleString('es-AR')
    const datosPago = cuenta
      ? `💳 Medios de pago:\nPodés abonar en efectivo en el estudio o por transferencia:\n- Alias: ${cuenta.alias || '—'}\n- Titular: ${cuenta.titular || '—'}\n- CUIL/CUIT: ${cuenta.cuil || '—'}\n- Entidad: ${cuenta.entidad || '—'}`
      : ''

    if (tipoMensaje === 'recordatorio') {
      return `Hola ${mensajeModal.nombre}! Te recordamos que la cuota de ${labelMes} vence el día 10 para mantener tu cupo reservado 🧘‍♀️\n\nEl monto es $${monto}.\n\n${datosPago}\n\n¡Gracias!\nRomana Studio`
    }
    return `Hola ${mensajeModal.nombre}! Vimos que todavía no registramos el pago de la cuota de ${labelMes} (venció el día 10).\n\nEl monto es $${monto}.\n\n${datosPago}\n\nSi ya la abonaste avisanos para actualizarlo. ¡Gracias!\nRomana Studio`
  }

  async function copiarMensajeCobranza() {
    try {
      await navigator.clipboard.writeText(textoMensaje())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar automáticamente, seleccioná el texto manualmente.')
    }
  }

  const chipEstado = {
    pagado: 'bg-[#5C6F5D] text-white',
    pendiente: 'bg-[#EDE7DD] text-[#8A6B2C]',
    vencido: 'bg-[#B5504A] text-white',
    exento: 'bg-[#E3E3DE] text-[#8A8378]'
  }
  const labelEstado = { pagado: 'Pagado', pendiente: 'Pendiente', vencido: 'Vencido', exento: 'Exento' }
  const contadorFiltro = { pagado: 0, pendiente: 0, vencido: 0, exento: 0 }
  alumnosDelMes.forEach(a => { contadorFiltro[estadoDe(a)] = (contadorFiltro[estadoDe(a)] || 0) + 1 })

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <nav className="flex gap-4 flex-wrap">
          <a href="/dashboard" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Dashboard</a>
          <a href="/" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Días y Horarios</a>
          <a href="/cobranza" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Cobranza</a>
          <a href="/gastos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Gastos</a>
          <a href="/finanzas" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Finanzas</a>
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
      <p className="text-xs text-[#8A8378] mb-6">Vencimiento del mes: día 10 · click en el estado de un alumno pendiente o vencido para copiar el mensaje de WhatsApp</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[#8A8378]">Cobrado</p>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Cobrado real</p>
            <p className="text-2xl font-semibold text-[#5C6F5D]">${cobradoReal.toLocaleString('es-AR')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Efectivo</p>
              <p className="text-lg font-semibold text-[#221F1B]">${totalEfectivo.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Transferencia</p>
              <p className="text-lg font-semibold text-[#221F1B]">${totalTransferencia.toLocaleString('es-AR')}</p>
              {transferenciasPorCuenta.map(t => (
                <p key={t.nombre} className="text-sm text-[#8A8378] mt-1">{t.nombre}: ${t.total.toLocaleString('es-AR')}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[#8A8378]">Proyección</p>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Proyectado</p>
            <p className="text-2xl font-semibold text-[#221F1B]">${proyectado.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Pendiente de cobrar</p>
            <p className="text-2xl font-semibold text-[#B5504A]">${pendienteCobrar.toLocaleString('es-AR')}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'pagado', 'pendiente', 'vencido', 'exento'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
            {f === 'todos' ? `Todos (${alumnosDelMes.length})` : `${labelEstado[f]}s (${contadorFiltro[f] || 0})`}
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
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Proyectado</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Pagado</th>
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
                const puedeMensaje = estado === 'pendiente' || estado === 'vencido'
                return (
                  <tr key={a.id} className={`border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9] ${estado === 'vencido' ? 'bg-[#FBEAE8]' : ''}`}>
                    <td className="px-4 py-3 text-sm text-[#221F1B]">{a.nombre}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{a.clasesReales}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {a.exento_pago ? '—' : `$${cuotaEsperada(a).toLocaleString('es-AR')}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {c?.monto ? `$${Number(c.monto).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {puedeMensaje ? (
                        <button onClick={() => abrirMensaje(a)} className={`text-xs px-2 py-1 rounded-full font-medium ${chipEstado[estado]} hover:opacity-80`}>
                          {labelEstado[estado]}
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${chipEstado[estado]}`}>
                          {labelEstado[estado]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.forma_pago || '—'}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.cuentas?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {!a.exento_pago && (
                        <button onClick={() => abrirPago(a)} className="text-xs text-[#5C6F5D] hover:underline">
                          {c ? 'Editar' : 'Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {alumnosFiltrados.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin resultados</td></tr>
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

            <label className="block text-xs text-[#8A8378] mb-1">Proyección para este alumno este mes</label>
            <input type="number" value={montoEsperadoForm} onChange={e => setMontoEsperadoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-[#5C6F5D]" />
            <p className="text-[11px] text-[#8A8378] mb-3">Ajustala si entró a mitad de mes, paga distinto, o cualquier caso especial — así el proyectado no miente.</p>

            <label className="block text-xs text-[#8A8378] mb-1">Monto pagado (dejalo vacío si todavía no pagó)</label>
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

      {mensajeModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setMensajeModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Mensaje para {mensajeModal.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">{labelMes}</p>

            <label className="block text-xs text-[#8A8378] mb-1">Tipo de mensaje</label>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setTipoMensaje('recordatorio')} className={`px-4 py-1.5 rounded-full text-sm border ${tipoMensaje === 'recordatorio' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                Recordatorio
              </button>
              <button onClick={() => setTipoMensaje('vencido')} className={`px-4 py-1.5 rounded-full text-sm border ${tipoMensaje === 'vencido' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                Vencido
              </button>
            </div>

            <label className="block text-xs text-[#8A8378] mb-1">Cuenta a mostrar en el mensaje</label>
            <div className="flex gap-2 mb-4 flex-wrap">
              {cuentas.map(ct => (
                <button key={ct.id} onClick={() => setCuentaMensajeId(ct.id)} className={`px-4 py-1.5 rounded-full text-sm border ${cuentaMensajeId === ct.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {ct.nombre}
                </button>
              ))}
            </div>

            <div className="bg-[#F5F1E9] rounded-lg p-4 mb-4 whitespace-pre-line text-sm text-[#221F1B] max-h-64 overflow-y-auto">
              {textoMensaje()}
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setMensajeModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
              <button onClick={copiarMensajeCobranza} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
                {copiado ? '✓ Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}