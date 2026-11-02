
import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const formatoNumero = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
})

const periodoActual = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

const fechaActual = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

const nombresIntegrantes = {
  'cf23d10a-e7e8-47fc-91ad-cd376fdb6fbf': 'Cristian',
  'f15e4e8b-0b73-46a6-850f-e53e06c866e2': 'Jimena',
}

const integrantes = [
  { id: 'cf23d10a-e7e8-47fc-91ad-cd376fdb6fbf', nombre: 'Cristian' },
  { id: 'f15e4e8b-0b73-46a6-850f-e53e06c866e2', nombre: 'Jimena' },
]

const mediosPago = [
  'Efectivo',
  'Cuenta de ahorros',
  'Cuenta corriente',
  'Tarjeta débito',
  'Tarjeta crédito',
  'Billetera digital',
]

const coloresCategorias = [
  '#20a879', '#4b83b9', '#9473c6',
  '#e6a34a', '#df7168', '#39a5a5',
]

const formularioInicial = {
  tipo: 'gasto',
  fecha: fechaActual(),
  categoria_id: '',
  descripcion: '',
  valor: '',
  pagado_por: '',
  origen_dinero: 'fondo_hogar',
  medio_pago: '',
  cuenta: '',
  observaciones: '',
}

function obtenerMesesEntreFechas(desde, hasta) {
  if (!desde || !hasta || desde > hasta) return []
  const [anioInicio, mesInicio] = desde.slice(0, 7).split('-').map(Number)
  const [anioFin, mesFin] = hasta.slice(0, 7).split('-').map(Number)
  const meses = []
  let anio = anioInicio
  let mes = mesInicio
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    if (anio > 2026 || (anio === 2026 && mes >= 10)) {
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`
      const etiqueta = new Date(anio, mes - 1, 1).toLocaleDateString('es-CO', {
        month: 'long', year: 'numeric',
      })
      meses.push({ anio, mes, periodo, etiqueta })
    }
    mes += 1
    if (mes === 13) { mes = 1; anio += 1 }
  }
  return meses
}

function App() {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [hogar, setHogar] = useState(null)

  const [periodo, setPeriodo] = useState(periodoActual())
  const [datos, setDatos] = useState({
    ingresos: 0,
    gastos: 0,
    presupuesto: 0,
    movimientos: [],
    categorias: [],
    rubros: [],
  })

  const [catalogoCategorias, setCatalogoCategorias] = useState([])
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [seccion, setSeccion] = useState('dashboard')
  const [formulario, setFormulario] = useState(formularioInicial)
  const [guardando, setGuardando] = useState(false)
  const [actualizacion, setActualizacion] = useState(0)
  const [movimientoEditando, setMovimientoEditando] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [busquedaMovimiento, setBusquedaMovimiento] = useState('')
  const [fechaDesde, setFechaDesde] = useState(`${periodoActual()}-01`)
  const [fechaHasta, setFechaHasta] = useState(fechaActual())
  const fechaDesdeRef = useRef(null)
  const fechaHastaRef = useRef(null)
  const [movimientosHistorial, setMovimientosHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [procesandoMovimiento, setProcesandoMovimiento] = useState(false)
  const [presupuestosEdicion, setPresupuestosEdicion] = useState({})
  const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false)
  const [aportesMensuales, setAportesMensuales] = useState([])
  const [resumenMensualRango, setResumenMensualRango] = useState([])
  const [cargandoResumenRango, setCargandoResumenRango] = useState(false)
  const [aportesEdicion, setAportesEdicion] = useState({})
  const [guardandoAporte, setGuardandoAporte] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSesion(session)
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function cargarHogar() {
      if (!sesion) {
        setHogar(null)
        return
      }

      const { data, error } = await supabase
        .from('hogares')
        .select('id, nombre, moneda')
        .limit(1)
        .maybeSingle()

      if (error) {
        setError(error.message)
        return
      }

      setHogar(data)
    }

    cargarHogar()
  }, [sesion])

  useEffect(() => {
    async function cargarDatosMensuales() {
      if (!hogar) return

      setCargandoDatos(true)
      setError('')

      const [anio, mes] = periodo.split('-').map(Number)

      try {
        const [
          respuestaMovimientos,
          respuestaPresupuesto,
          respuestaCategorias,
        ] = await Promise.all([
          supabase
            .from('movimientos')
            .select('id, tipo, descripcion, valor, fecha, registrado_por, pagado_por, categoria_id, origen_dinero, medio_pago, cuenta, observaciones')
            .eq('hogar_id', hogar.id)
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: false }),

          supabase
            .from('presupuestos')
            .select('categoria_id, valor')
            .eq('hogar_id', hogar.id)
            .eq('anio', anio)
            .eq('mes', mes),

          supabase
            .from('categorias')
            .select('id, nombre, tipo, categoria_principal')
            .eq('hogar_id', hogar.id)
            .eq('activa', true),
        ])

        const errorConsulta =
          respuestaMovimientos.error ||
          respuestaPresupuesto.error ||
          respuestaCategorias.error

        if (errorConsulta) {
          setError(errorConsulta.message)
          return
        }

        const movimientos = respuestaMovimientos.data || []
        const presupuestos = respuestaPresupuesto.data || []
        const catalogo = respuestaCategorias.data || []
        const categoriasGasto = catalogo.filter(c => c.tipo === 'gasto')

        setCatalogoCategorias(catalogo)

        const ingresos = movimientos
          .filter(item => item.tipo === 'ingreso')
          .reduce((total, item) => total + Number(item.valor), 0)

        const gastos = movimientos
          .filter(item => item.tipo === 'gasto')
          .reduce((total, item) => total + Number(item.valor), 0)

        const presupuesto = presupuestos
          .reduce((total, item) => total + Number(item.valor), 0)

        const resumenRubros = categoriasGasto.map(categoria => {
          const gastado = movimientos
            .filter(item =>
              item.tipo === 'gasto' &&
              item.categoria_id === categoria.id
            )
            .reduce((total, item) => total + Number(item.valor), 0)

          const presupuestoRubro = presupuestos
            .filter(item => item.categoria_id === categoria.id)
            .reduce((total, item) => total + Number(item.valor), 0)

          return {
            id: categoria.id,
            nombre: categoria.nombre,
            principal: categoria.categoria_principal || categoria.nombre,
            gastado,
            presupuesto: presupuestoRubro,
            disponible: presupuestoRubro - gastado,
          }
        })

        const grupos = resumenRubros.reduce((resultado, rubro) => {
          const nombre = rubro.principal

          if (!resultado[nombre]) {
            resultado[nombre] = {
              nombre,
              gastado: 0,
              presupuesto: 0,
              rubros: [],
            }
          }

          resultado[nombre].gastado += rubro.gastado
          resultado[nombre].presupuesto += rubro.presupuesto
          resultado[nombre].rubros.push(rubro)

          return resultado
        }, {})

        const resumenCategorias = Object.values(grupos).map(grupo => ({
          ...grupo,
          disponible: grupo.presupuesto - grupo.gastado,
        }))

        setDatos({
          ingresos,
          gastos,
          presupuesto,
          movimientos,
          categorias: resumenCategorias,
          rubros: resumenRubros,
        })
      } catch (err) {
        setError(err.message || 'No fue posible consultar la información.')
      } finally {
        setCargandoDatos(false)
      }
    }

    cargarDatosMensuales()

  }, [hogar, periodo, fechaDesde, fechaHasta, actualizacion])

  // Consultar los aportes del periodo seleccionado y crear su configuración si hace falta.
  useEffect(() => {
    async function cargarAportes() {
      if (!hogar) return
      const [anio, mes] = periodo.split('-').map(Number)
      const { error: errorRpc } = await supabase.rpc('generar_configuracion_mensual', {
        p_hogar_id: hogar.id,
        p_anio: anio,
        p_mes: mes,
      })
      if (errorRpc) {
        setError(errorRpc.message)
        return
      }
      const { data, error: errorConsulta } = await supabase
        .from('aportes_mensuales')
        .select('usuario_id, valor, anio, mes')
        .eq('hogar_id', hogar.id)
        .eq('anio', anio)
        .eq('mes', mes)
      if (errorConsulta) {
        setError(errorConsulta.message)
        return
      }
      setAportesMensuales(data || [])
      setAportesEdicion({})
    }
    cargarAportes()
  }, [hogar, periodo, actualizacion])

  // Construye un resumen independiente para cada mes tocado por el rango consultado.
  // Los valores mensuales se muestran completos; los gastos sí respetan las fechas exactas.
  useEffect(() => {
    let cancelado = false
    async function cargarResumenMensualRango() {
      if (!hogar || !fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
        setResumenMensualRango([])
        return
      }
      const meses = obtenerMesesEntreFechas(fechaDesde, fechaHasta)
      if (!meses.length) {
        setResumenMensualRango([])
        return
      }
      setCargandoResumenRango(true)
      try {
        // Garantiza que cada mes exista y herede la configuración del mes anterior.
        for (const item of meses) {
          const { error: errorRpc } = await supabase.rpc('generar_configuracion_mensual', {
            p_hogar_id: hogar.id, p_anio: item.anio, p_mes: item.mes,
          })
          if (errorRpc) throw errorRpc
        }
        const [rMov, rCat, rPre, rApo] = await Promise.all([
          supabase.from('movimientos').select('tipo, valor, fecha, categoria_id')
            .eq('hogar_id', hogar.id).gte('fecha', fechaDesde).lte('fecha', fechaHasta),
          supabase.from('categorias').select('id, nombre, tipo, categoria_principal')
            .eq('hogar_id', hogar.id).eq('activa', true),
          supabase.from('presupuestos').select('categoria_id, anio, mes, valor')
            .eq('hogar_id', hogar.id),
          supabase.from('aportes_mensuales').select('usuario_id, anio, mes, valor')
            .eq('hogar_id', hogar.id),
        ])
        const errorConsulta = rMov.error || rCat.error || rPre.error || rApo.error
        if (errorConsulta) throw errorConsulta
        const movimientos = rMov.data || []
        const categoriasGasto = (rCat.data || []).filter(c => c.tipo === 'gasto')
        const presupuestos = rPre.data || []
        const aportes = rApo.data || []
        const resultado = meses.map(item => {
          const presupuestoMes = presupuestos.filter(x => x.anio === item.anio && x.mes === item.mes)
          const aportesMes = integrantes.map(persona => {
            const registro = aportes.find(x => x.anio === item.anio && x.mes === item.mes && x.usuario_id === persona.id)
            return { ...persona, valor: Number(registro?.valor || 0) }
          })
          const rubros = categoriasGasto.map(cat => {
            const presupuesto = Number(presupuestoMes.find(x => x.categoria_id === cat.id)?.valor || 0)
            const gastado = movimientos.filter(m => m.tipo === 'gasto' && m.fecha.slice(0, 7) === item.periodo && m.categoria_id === cat.id)
              .reduce((sum, m) => sum + Number(m.valor || 0), 0)
            return { id: cat.id, nombre: cat.nombre, presupuesto, gastado }
          })
          return {
            ...item,
            rubros,
            totalPresupuesto: rubros.reduce((sum, x) => sum + x.presupuesto, 0),
            totalGastado: rubros.reduce((sum, x) => sum + x.gastado, 0),
            aportes: aportesMes,
            totalAportes: aportesMes.reduce((sum, x) => sum + x.valor, 0),
          }
        })
        if (!cancelado) setResumenMensualRango(resultado)
      } catch (err) {
        if (!cancelado) {
          setResumenMensualRango([])
          setError(err.message || 'No fue posible consultar los resúmenes mensuales.')
        }
      } finally {
        if (!cancelado) setCargandoResumenRango(false)
      }
    }
    cargarResumenMensualRango()
    return () => { cancelado = true }
  }, [hogar, fechaDesde, fechaHasta, actualizacion])

  // El historial consulta un rango propio, independiente del mes del Dashboard.
  useEffect(() => {
    async function cargarHistorial() {
      if (!hogar || !fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
        setMovimientosHistorial([])
        return
      }

      setCargandoHistorial(true)
      const { data, error: errorHistorial } = await supabase
        .from('movimientos')
        .select('id, tipo, descripcion, valor, fecha, registrado_por, pagado_por, categoria_id, origen_dinero, medio_pago, cuenta, observaciones')
        .eq('hogar_id', hogar.id)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false })

      if (errorHistorial) {
        setError(errorHistorial.message)
      } else {
        setMovimientosHistorial(data || [])
      }
      setCargandoHistorial(false)
    }

    cargarHistorial()
  }, [hogar, fechaDesde, fechaHasta, actualizacion])

  async function iniciarSesion(e) {
    e.preventDefault()
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: contrasena,
    })

    if (error) setError(error.message)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setHogar(null)
    setError('')
    setMensaje('')
  }

  function cambiarTipo(tipo) {
    setMovimientoEditando(null)
    setFormulario({
      ...formularioInicial,
      tipo,
      fecha: fechaActual(),
    })
    setError('')
    setMensaje('')
  }

  function cambiarCampo(e) {
    const { name, value } = e.target

    if (name === 'valor') {
      // Solo permite números y los muestra con separador de miles.
      const soloDigitos = value.replace(/\D/g, '')
      const valorFormateado = soloDigitos
        ? formatoNumero.format(Number(soloDigitos))
        : ''

      setFormulario(actual => ({
        ...actual,
        valor: valorFormateado,
      }))
      return
    }

    setFormulario(actual => ({
      ...actual,
      [name]: value,
    }))
  }

  async function guardarMovimiento(e) {
    e.preventDefault()
    setError('')
    setMensaje('')

    if (!hogar) {
      setError('No se encontró la información del hogar.')
      return
    }

    if (!formulario.categoria_id) {
      setError('Selecciona una categoría o rubro.')
      return
    }

    if (!formulario.pagado_por) {
      setError(
        formulario.tipo === 'gasto'
          ? 'Selecciona quién realizó el pago.'
          : 'Selecciona quién recibió el dinero.'
      )
      return
    }

    // Se eliminan los puntos antes de convertir el valor a número.
    const valor = Number(formulario.valor.replace(/\D/g, ''))

    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Ingresa un valor válido mayor que cero.')
      return
    }

    setGuardando(true)

    try {
      const nuevoMovimiento = {
        hogar_id: hogar.id,
        tipo: formulario.tipo,
        categoria_id: formulario.categoria_id,
        descripcion: formulario.descripcion.trim(),
        valor,
        fecha: formulario.fecha,
        registrado_por: sesion.user.id,
        pagado_por: formulario.pagado_por,
        origen_dinero: formulario.tipo === 'gasto'
          ? formulario.origen_dinero
          : null,
        medio_pago: formulario.medio_pago || null,
        cuenta: formulario.cuenta.trim() || null,
        observaciones: formulario.observaciones.trim() || null,
      }

      let respuesta

      if (movimientoEditando) {
        const { registrado_por, ...datosActualizables } = nuevoMovimiento
        respuesta = await supabase
          .from('movimientos')
          .update(datosActualizables)
          .eq('id', movimientoEditando)
          .eq('hogar_id', hogar.id)
      } else {
        respuesta = await supabase
          .from('movimientos')
          .insert(nuevoMovimiento)
      }

      if (respuesta.error) throw respuesta.error

      setMensaje(
        movimientoEditando
          ? '¡Movimiento actualizado correctamente!'
          : formulario.tipo === 'gasto'
            ? '¡Gasto registrado correctamente!'
            : '¡Ingreso registrado correctamente!'
      )

      setPeriodo(formulario.fecha.slice(0, 7))
      setFormulario(formularioInicial)
      setMovimientoEditando(null)
      setActualizacion(actual => actual + 1)
      setSeccion('movimientos')
    } catch (err) {
      setError(err.message || 'No fue posible guardar el movimiento.')
    } finally {
      setGuardando(false)
    }
  }

  function prepararEdicion(movimiento) {
    setMovimientoEditando(movimiento.id)
    setFormulario({
      tipo: movimiento.tipo,
      fecha: movimiento.fecha,
      categoria_id: movimiento.categoria_id || '',
      descripcion: movimiento.descripcion || '',
      valor: formatoNumero.format(Number(movimiento.valor)),
      pagado_por: movimiento.pagado_por || '',
      origen_dinero: movimiento.origen_dinero || 'fondo_hogar',
      medio_pago: movimiento.medio_pago || '',
      cuenta: movimiento.cuenta || '',
      observaciones: movimiento.observaciones || '',
    })
    setError('')
    setMensaje('')
    setSeccion('registrar')
  }

  async function eliminarMovimiento(movimiento) {
    const confirmado = window.confirm(
      `¿Seguro que deseas eliminar este ${movimiento.tipo} de ${formatoCOP.format(Number(movimiento.valor))} (${movimiento.descripcion})? Esta acción no se puede deshacer.`
    )
    if (!confirmado) return

    setProcesandoMovimiento(true)
    setError('')
    setMensaje('')
    try {
      const { error } = await supabase
        .from('movimientos')
        .delete()
        .eq('id', movimiento.id)
        .eq('hogar_id', hogar.id)

      if (error) throw error
      setMensaje('Movimiento eliminado correctamente.')
      setActualizacion(actual => actual + 1)
    } catch (err) {
      setError(err.message || 'No fue posible eliminar el movimiento.')
    } finally {
      setProcesandoMovimiento(false)
    }
  }

  function cambiarPresupuesto(rubroId, valor) {
    // Mientras se escribe conservamos los dígitos sin separadores de miles.
    // Así el cursor no salta de posición al reformatear el campo en cada tecla.
    const soloDigitos = valor.replace(/\D/g, '')
    setPresupuestosEdicion(actual => ({ ...actual, [rubroId]: soloDigitos }))
  }

  async function guardarPresupuesto(rubro) {
    if (!hogar) return
    const valorTexto = presupuestosEdicion[rubro.id] ?? formatoNumero.format(rubro.presupuesto)
    const valor = Number(String(valorTexto).replace(/\D/g, ''))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Ingresa un presupuesto válido mayor que cero.')
      return
    }
    const [anio, mes] = periodo.split('-').map(Number)
    setGuardandoPresupuesto(true)
    setError('')
    setMensaje('')
    try {
      const { error: errorRpc } = await supabase.rpc('generar_configuracion_mensual', { p_hogar_id: hogar.id, p_anio: anio, p_mes: mes })
      if (errorRpc) throw errorRpc
      const { error: errorUpsert } = await supabase.from('presupuestos').upsert({ hogar_id: hogar.id, categoria_id: rubro.id, anio, mes, valor }, { onConflict: 'hogar_id,categoria_id,anio,mes' })
      if (errorUpsert) throw errorUpsert
      const { data: filas, error: errorConsulta } = await supabase.from('presupuestos').select('id, anio, mes').eq('hogar_id', hogar.id).eq('categoria_id', rubro.id)
      if (errorConsulta) throw errorConsulta
      const posteriores = (filas || []).filter(fila => fila.anio > anio || (fila.anio === anio && fila.mes > mes))
      for (const fila of posteriores) {
        const { error: errorUpdate } = await supabase.from('presupuestos').update({ valor }).eq('id', fila.id)
        if (errorUpdate) throw errorUpdate
      }
      setPresupuestosEdicion(actual => ({ ...actual, [rubro.id]: String(valor) }))
      setMensaje(`Presupuesto de “${rubro.nombre}” actualizado desde ${periodo} y para los meses posteriores ya creados.`)
      setActualizacion(actual => actual + 1)
    } catch (err) {
      setError(err.message || 'No fue posible actualizar el presupuesto.')
    } finally {
      setGuardandoPresupuesto(false)
    }
  }

  function cambiarAporte(usuarioId, valor) {
    const soloDigitos = valor.replace(/\D/g, '')
    setAportesEdicion(actual => ({ ...actual, [usuarioId]: soloDigitos }))
  }

  async function guardarAporte(integrante) {
    if (!hogar) return
    const registroActual = aportesMensuales.find(item => item.usuario_id === integrante.id)
    const texto = aportesEdicion[integrante.id] ?? String(registroActual?.valor ?? '')
    const valor = Number(String(texto).replace(/\D/g, ''))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Ingresa un aporte válido mayor que cero.')
      return
    }
    const [anio, mes] = periodo.split('-').map(Number)
    setGuardandoAporte(true)
    setError('')
    setMensaje('')
    try {
      const { error: errorRpc } = await supabase.rpc('generar_configuracion_mensual', {
        p_hogar_id: hogar.id, p_anio: anio, p_mes: mes,
      })
      if (errorRpc) throw errorRpc

      const { error: errorUpsert } = await supabase
        .from('aportes_mensuales')
        .upsert({ hogar_id: hogar.id, usuario_id: integrante.id, anio, mes, valor }, {
          onConflict: 'hogar_id,usuario_id,anio,mes',
        })
      if (errorUpsert) throw errorUpsert

      const { data: filas, error: errorConsulta } = await supabase
        .from('aportes_mensuales')
        .select('id, anio, mes')
        .eq('hogar_id', hogar.id)
        .eq('usuario_id', integrante.id)
      if (errorConsulta) throw errorConsulta

      const posteriores = (filas || []).filter(fila =>
        fila.anio > anio || (fila.anio === anio && fila.mes > mes)
      )
      for (const fila of posteriores) {
        const { error: errorUpdate } = await supabase
          .from('aportes_mensuales')
          .update({ valor })
          .eq('id', fila.id)
        if (errorUpdate) throw errorUpdate
      }

      setAportesEdicion(actual => ({ ...actual, [integrante.id]: String(valor) }))
      setMensaje(`Aporte de ${integrante.nombre} actualizado desde ${periodo} y para los meses posteriores ya creados.`)
      setActualizacion(actual => actual + 1)
    } catch (err) {
      setError(err.message || 'No fue posible actualizar el aporte.')
    } finally {
      setGuardandoAporte(false)
    }
  }

  if (cargando) {
    return <div className="loading-screen">Cargando Finanzas del Hogar...</div>
  }

  if (!sesion) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <div className="brand-icon">FH</div>
          <h1>Finanzas del Hogar</h1>
          <p className="subtitle">Organicen juntos sus finanzas familiares.</p>

          <form onSubmit={iniciarSesion}>
            <label>Correo electrónico</label>
            <input
              type="email"
              value={correo}
              onChange={e => setCorreo(e.target.value)}
              placeholder="Ingresa tu correo"
              required
            />

            <label>Contraseña</label>
            <input
              type="password"
              value={contrasena}
              onChange={e => setContrasena(e.target.value)}
              placeholder="Ingresa tu contraseña"
              required
            />

            <button className="primary-button" type="submit">
              Iniciar sesión
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}
        </section>
      </main>
    )
  }

  const [anioSeleccionado, mesSeleccionado] = periodo.split('-')

  const nombreMes = new Date(
    Number(anioSeleccionado),
    Number(mesSeleccionado) - 1,
    1
  ).toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric',
  })

  const saldo = datos.ingresos - datos.gastos

  const porcentajePresupuesto = datos.presupuesto > 0
    ? (datos.gastos / datos.presupuesto) * 100
    : 0

  const porcentajeGrafico = (valor, total) =>
    total > 0 ? (valor / total) * 100 : 0

  const categoriasFormulario = catalogoCategorias.filter(
    categoria => categoria.tipo === formulario.tipo
  )

  const ingresosPorFuente = catalogoCategorias.filter(c => c.tipo === 'ingreso').map(c => ({
    nombre: c.nombre,
    valor: datos.movimientos.filter(m => m.tipo === 'ingreso' && m.categoria_id === c.id).reduce((t, m) => t + Number(m.valor), 0),
  })).filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor)
  const aportesCristian = Number(aportesMensuales.find(x => x.usuario_id === integrantes[0].id)?.valor || 0)
  const aportesJimena = Number(aportesMensuales.find(x => x.usuario_id === integrantes[1].id)?.valor || 0)
  const totalAportesHogar = aportesCristian + aportesJimena
  const evolucionMensual = obtenerMesesEntreFechas(fechaDesde, fechaHasta).map(m => {
    const delMes = datos.movimientos.filter(x => x.fecha.slice(0, 7) === m.periodo)
    const ingreso = delMes.filter(x => x.tipo === 'ingreso').reduce((t, x) => t + Number(x.valor), 0)
    const gasto = delMes.filter(x => x.tipo === 'gasto').reduce((t, x) => t + Number(x.valor), 0)
    return { ...m, ingreso, gasto, saldo: ingreso - gasto }
  })
  const maxEvolucion = Math.max(1, ...evolucionMensual.flatMap(x => [x.ingreso, x.gasto]))

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">FH</div>
          <div>
            <strong>Finanzas</strong>
            <span>Del Hogar</span>
          </div>
        </div>

        <nav className="navigation">
          <p className="nav-heading">MENÚ PRINCIPAL</p>
          <a className={`nav-link ${seccion === 'dashboard' ? 'active' : ''}`} href="#dashboard" onClick={() => setSeccion('dashboard')}>▦ Dashboard</a>
          <a className={`nav-link ${seccion === 'presupuestos' ? 'active' : ''}`} href="#presupuestos" onClick={() => { setSeccion('presupuestos'); setError(''); setMensaje('') }}>▤ Presupuestos</a>
          <a className={`nav-link ${seccion === 'aportes' ? 'active' : ''}`} href="#aportes" onClick={() => { setSeccion('aportes'); setError(''); setMensaje('') }}>＋ Aportes del hogar</a>
          <a className={`nav-link ${seccion === 'movimientos' || seccion === 'registrar' ? 'active' : ''}`} href="#movimientos" onClick={() => { setSeccion('movimientos'); setError(''); setMensaje('') }}>↕ Movimientos</a>
          <a className={`nav-link ${seccion === 'reportes' ? 'active' : ''}`} href="#reportes" onClick={() => setSeccion('reportes')}>▥ Reportes</a>
        </nav>

        <div className="sidebar-bottom">
          <span>Hogar compartido</span>
          <strong>{hogar?.nombre || 'Finanzas del Hogar'}</strong>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">ADMINISTRACIÓN FAMILIAR</span>
            <h1>Finanzas del Hogar</h1>
          </div>

          <div className="user-area">
            <div className="user-avatar">
              {sesion.user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <strong>{sesion.user.email}</strong>
              <span>
                {nombresIntegrantes[sesion.user.id] || 'Integrante del hogar'}
              </span>
            </div>
            <button className="logout-button" onClick={cerrarSesion}>
              Salir
            </button>
          </div>
        </header>

        {mensaje && <p className="success-message">{mensaje}</p>}
        {error && <p className="error-message">{error}</p>}

        {seccion === 'registrar' ? (
          <section className="category-overview movement-form-section">
            <div className="section-heading">
              <div>
                <h3>{movimientoEditando ? 'Editar movimiento' : 'Registrar movimiento'}</h3>
                <p>{movimientoEditando ? 'Actualiza la información del movimiento seleccionado.' : 'Registra los ingresos y gastos de tu hogar.'}</p>
              </div>
            </div>

            <div className="movement-type-selector">
              <button
                type="button"
                className={formulario.tipo === 'gasto' ? 'type-button active-expense' : 'type-button'}
                disabled={Boolean(movimientoEditando)}
                onClick={() => cambiarTipo('gasto')}
              >
                − Registrar gasto
              </button>

              <button
                type="button"
                className={formulario.tipo === 'ingreso' ? 'type-button active-income' : 'type-button'}
                disabled={Boolean(movimientoEditando)}
                onClick={() => cambiarTipo('ingreso')}
              >
                + Registrar ingreso
              </button>
            </div>

            <form className="movement-form" onSubmit={guardarMovimiento}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="fecha">Fecha del movimiento *</label>
                  <input
                    id="fecha"
                    name="fecha"
                    type="date"
                    value={formulario.fecha}
                    onChange={cambiarCampo}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="valor">Valor (COP) *</label>
                  <div className="value-input-wrap">
                    <span>$</span>
                    <input
                      id="valor"
                      name="valor"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formulario.valor}
                      onChange={cambiarCampo}
                      placeholder="0"
                      required
                    />
                  </div>
                </div>

                <div className="form-field full-field">
                  <label htmlFor="descripcion">Descripción *</label>
                  <input
                    id="descripcion"
                    name="descripcion"
                    type="text"
                    value={formulario.descripcion}
                    onChange={cambiarCampo}
                    placeholder={
                      formulario.tipo === 'gasto'
                        ? 'Ej. Compra de mercado'
                        : 'Ej. Pago de salario'
                    }
                    maxLength="150"
                    required
                  />
                </div>

                <div className="form-field full-field">
                  <label htmlFor="categoria_id">
                    {formulario.tipo === 'gasto'
                      ? 'Rubro del gasto *'
                      : 'Categoría del ingreso *'}
                  </label>

                  <select
                    id="categoria_id"
                    name="categoria_id"
                    value={formulario.categoria_id}
                    onChange={cambiarCampo}
                    required
                  >
                    <option value="">Selecciona una opción</option>

                    {formulario.tipo === 'gasto'
                      ? [...new Set(categoriasFormulario.map(c => c.categoria_principal || c.nombre))].map(principal => (
                          <optgroup label={principal} key={principal}>
                            {categoriasFormulario
                              .filter(c => (c.categoria_principal || c.nombre) === principal)
                              .map(categoria => (
                                <option value={categoria.id} key={categoria.id}>
                                  {categoria.nombre}
                                </option>
                              ))}
                          </optgroup>
                        ))
                      : categoriasFormulario.map(categoria => (
                          <option value={categoria.id} key={categoria.id}>
                            {categoria.nombre}
                          </option>
                        ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="pagado_por">
                    {formulario.tipo === 'gasto'
                      ? '¿Quién realizó el pago? *'
                      : '¿Quién recibió el dinero? *'}
                  </label>

                  <select
                    id="pagado_por"
                    name="pagado_por"
                    value={formulario.pagado_por}
                    onChange={cambiarCampo}
                    required
                  >
                    <option value="">Selecciona una persona</option>
                    {integrantes.map(persona => (
                      <option value={persona.id} key={persona.id}>
                        {persona.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {formulario.tipo === 'gasto' && (
                  <div className="form-field">
                    <label htmlFor="origen_dinero">Origen del dinero *</label>
                    <select
                      id="origen_dinero"
                      name="origen_dinero"
                      value={formulario.origen_dinero}
                      onChange={cambiarCampo}
                      required
                    >
                      <option value="fondo_hogar">Fondo del hogar</option>
                      <option value="dinero_personal">Dinero personal</option>
                    </select>
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="medio_pago">Medio de pago</label>
                  <select
                    id="medio_pago"
                    name="medio_pago"
                    value={formulario.medio_pago}
                    onChange={cambiarCampo}
                  >
                    <option value="">Selecciona un medio</option>
                    {mediosPago.map(medio => (
                      <option value={medio} key={medio}>{medio}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="cuenta">Cuenta o referencia</label>
                  <input
                    id="cuenta"
                    name="cuenta"
                    type="text"
                    value={formulario.cuenta}
                    onChange={cambiarCampo}
                    placeholder="Ej. Cuenta de ahorros"
                    maxLength="100"
                  />
                </div>

                <div className="form-field full-field">
                  <label htmlFor="observaciones">Observaciones</label>
                  <textarea
                    id="observaciones"
                    name="observaciones"
                    value={formulario.observaciones}
                    onChange={cambiarCampo}
                    rows="3"
                    placeholder="Información adicional (opcional)"
                  />
                </div>
              </div>

              <div className="registered-by">
                <span>Registrado automáticamente por:</span>
                <strong>
                  {nombresIntegrantes[sesion.user.id] || sesion.user.email}
                </strong>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="logout-button"
                  onClick={() => { setFormulario(formularioInicial); setMovimientoEditando(null) }}
                  disabled={guardando}
                >
                  Limpiar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={guardando}
                >
                  {guardando ? 'Guardando...' : movimientoEditando ? 'Guardar cambios' : 'Guardar movimiento'}
                </button>
              </div>
            </form>
          </section>
        ) : seccion === 'movimientos' ? (
          <section className="category-overview history-section" id="historial">
            <div className="section-heading history-heading">
              <div>
                <h3>Movimientos del hogar</h3>
                <p>Consulta, filtra, edita o elimina movimientos en cualquier rango de fechas.</p>
              </div>
              <button
                className="primary-button history-add-button"
                type="button"
                onClick={() => {
                  setMovimientoEditando(null)
                  setFormulario(formularioInicial)
                  setSeccion('registrar')
                  setError('')
                  setMensaje('')
                }}
              >
                + Nuevo movimiento
              </button>
            </div>

            <div className="history-filters">
              <div className="form-field">
                <label htmlFor="fechaDesde">Fecha inicial</label>
                <div className="date-picker-control">
                  <input ref={fechaDesdeRef} id="fechaDesde" type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={e => setFechaDesde(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha inicial" onClick={() => fechaDesdeRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="fechaHasta">Fecha final</label>
                <div className="date-picker-control">
                  <input ref={fechaHastaRef} id="fechaHasta" type="date" value={fechaHasta} min={fechaDesde || undefined} max={fechaActual()} onChange={e => setFechaHasta(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha final" onClick={() => fechaHastaRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="filtroTipo">Tipo de movimiento</label>
                <select id="filtroTipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="ingreso">Ingresos</option>
                  <option value="gasto">Gastos</option>
                </select>
              </div>
              <div className="form-field history-search">
                <label htmlFor="buscarMovimiento">Buscar por descripción</label>
                <input
                  id="buscarMovimiento"
                  type="search"
                  value={busquedaMovimiento}
                  onChange={e => setBusquedaMovimiento(e.target.value)}
                  placeholder="Escribe para buscar..."
                />
              </div>
            </div>

            {fechaDesde > fechaHasta ? (
              <p className="empty-state">La fecha inicial no puede ser posterior a la fecha final.</p>
            ) : cargandoHistorial ? (
              <p className="empty-state">Consultando movimientos...</p>
            ) : (() => {
              const movimientosFiltrados = movimientosHistorial.filter(movimiento => {
                const coincideTipo = filtroTipo === 'todos' || movimiento.tipo === filtroTipo
                const coincideTexto = movimiento.descripcion
                  .toLowerCase()
                  .includes(busquedaMovimiento.trim().toLowerCase())
                return coincideTipo && coincideTexto
              })

              return movimientosFiltrados.length === 0 ? (
                <p className="empty-state">No hay movimientos que coincidan con los filtros seleccionados.</p>
              ) : (
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th>Categoría / rubro</th>
                        <th>Registrado por</th>
                        <th>Pagado / recibido por</th>
                        <th>Valor</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientosFiltrados.map(movimiento => {
                        const categoria = catalogoCategorias.find(item => item.id === movimiento.categoria_id)
                        return (
                          <tr key={movimiento.id}>
                            <td>{movimiento.fecha}</td>
                            <td>
                              <strong>{movimiento.descripcion}</strong>
                              <span className={`history-type ${movimiento.tipo}`}>
                                {movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                              </span>
                            </td>
                            <td>{categoria?.nombre || 'Sin categoría'}</td>
                            <td>{nombresIntegrantes[movimiento.registrado_por] || 'Integrante'}</td>
                            <td>{nombresIntegrantes[movimiento.pagado_por] || 'No especificado'}</td>
                            <td className={movimiento.tipo === 'ingreso' ? 'income-text' : 'expense-text'}>
                              {movimiento.tipo === 'gasto' ? '−' : '+'}{formatoCOP.format(Number(movimiento.valor))}
                            </td>
                            <td>
                              <div className="history-actions">
                                <button type="button" className="edit-button" onClick={() => prepararEdicion(movimiento)}>
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="delete-button"
                                  disabled={procesandoMovimiento}
                                  onClick={() => eliminarMovimiento(movimiento)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            <p className="history-count">
              {movimientosHistorial.filter(m => filtroTipo === 'todos' || m.tipo === filtroTipo)
                .filter(m => m.descripcion.toLowerCase().includes(busquedaMovimiento.trim().toLowerCase())).length} movimiento(s) en el resultado.
            </p>
          </section>
        ) : seccion === 'aportes' ? (
          <section className="category-overview budget-management-section">
            <div className="section-heading"><div><h3>Administración de aportes del hogar</h3><p>Define cuánto aporta cada integrante desde el periodo seleccionado.</p></div></div>
            <section className="period-selector budget-period-selector">
              <div>
                <label htmlFor="periodoAportes">Mes desde el que entra en vigencia el cambio</label>
                <strong>{nombreMes}</strong>
              </div>
              <input
                id="periodoAportes"
                type="month"
                min="2026-10"
                value={periodo}
                onChange={e => {
                  if (!e.target.value || e.target.value < '2026-10') return
                  setPeriodo(e.target.value)
                  setAportesEdicion({})
                  setError('')
                  setMensaje('')
                }}
              />
            </section>
            <p className="budget-effective-note">Los meses anteriores no se modifican. El cambio se aplica al mes elegido y a los meses posteriores ya creados. Los meses futuros aún no creados heredarán este valor automáticamente.</p>
            <section className="history-filters global-date-filters">
              <div className="date-filter-intro">
                <strong>Periodo de consulta financiera</strong>
                <span>Consulta los movimientos dentro de estas fechas, sin cambiar el mes de vigencia del aporte.</span>
              </div>
              <div className="form-field">
                <label htmlFor="fechaDesdeAportes">Desde</label>
                <div className="date-picker-control">
                  <input ref={fechaDesdeRef} id="fechaDesdeAportes" type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={e => setFechaDesde(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha inicial" onClick={() => fechaDesdeRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="fechaHastaAportes">Hasta</label>
                <div className="date-picker-control">
                  <input ref={fechaHastaRef} id="fechaHastaAportes" type="date" value={fechaHasta} min={fechaDesde || undefined} max={fechaActual()} onChange={e => setFechaHasta(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha final" onClick={() => fechaHastaRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
            </section>
            <section className="monthly-range-summary">
              <div className="section-heading"><div><h3>Aportes por mes consultado</h3><p>Cada mes conserva sus propios valores; no se acumulan entre meses.</p></div></div>
              {cargandoResumenRango ? <p className="empty-state">Consultando aportes por mes...</p> : resumenMensualRango.length === 0 ? <p className="empty-state">No hay meses disponibles dentro del rango seleccionado.</p> : (
                <div className="monthly-summary-grid">
                  {resumenMensualRango.map(item => (
                    <article className="monthly-summary-card" key={`aporte-${item.periodo}`}>
                      <div className="monthly-summary-title"><strong>{item.etiqueta}</strong><span>{item.periodo}</span></div>
                      {item.aportes.map(persona => <div className="monthly-summary-line" key={persona.id}><span>{persona.nombre}</span><strong>{formatoCOP.format(persona.valor)}</strong></div>)}
                      <div className="monthly-summary-total"><span>Total mensual</span><strong>{formatoCOP.format(item.totalAportes)}</strong></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="section-heading monthly-editor-heading"><div><h3>Editar aportes</h3><p>Los cambios se guardarán desde {nombreMes} en adelante.</p></div></div>
            <div className="budget-editor-list">
              {integrantes.map(integrante => {
                const registro = aportesMensuales.find(item => item.usuario_id === integrante.id)
                const valorActual = Number(registro?.valor || 0)
                const valorTexto = aportesEdicion[integrante.id] ?? formatoNumero.format(valorActual)
                return (
                  <div className="budget-editor-row" key={integrante.id}>
                    <div className="budget-editor-info"><strong>{integrante.nombre}</strong><span>Aporte mensual para {periodo}</span></div>
                    <div className="budget-editor-control"><label htmlFor={`aporte-${integrante.id}`}>Aporte mensual</label><div className="value-input-wrap"><span>$</span><input id={`aporte-${integrante.id}`} type="text" inputMode="numeric" value={valorTexto} onChange={e => cambiarAporte(integrante.id, e.target.value)} onBlur={() => setAportesEdicion(actual => { const valor = actual[integrante.id]; return valor === undefined || valor === '' ? actual : { ...actual, [integrante.id]: formatoNumero.format(Number(valor)) } })} /></div></div>
                    <button type="button" className="primary-button budget-save-button" disabled={guardandoAporte} onClick={() => guardarAporte(integrante)}>{guardandoAporte ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                )
              })}
            </div>
            <div className="budget-total-card"><span>Total de aportes del mes</span><strong>{formatoCOP.format(integrantes.reduce((total, integrante) => { const registro = aportesMensuales.find(item => item.usuario_id === integrante.id); const texto = aportesEdicion[integrante.id]; return total + (texto !== undefined && texto !== '' ? Number(texto.replace(/\D/g, '')) : Number(registro?.valor || 0)) }, 0))}</strong></div>
          </section>
        ) : seccion === 'presupuestos' ? (
          <section className="category-overview budget-management-section">
            <div className="section-heading"><div><h3>Administración de presupuestos</h3><p>Define cuánto se asignará a cada rubro desde el periodo seleccionado.</p></div></div>
            <section className="period-selector budget-period-selector">
              <div>
                <label htmlFor="periodoPresupuesto">Mes desde el que entra en vigencia el cambio</label>
                <strong>{nombreMes}</strong>
              </div>
              <input
                id="periodoPresupuesto"
                type="month"
                min="2026-10"
                value={periodo}
                onChange={e => {
                  if (!e.target.value || e.target.value < '2026-10') return
                  setPeriodo(e.target.value)
                  setPresupuestosEdicion({})
                  setError('')
                  setMensaje('')
                }}
              />
            </section>
            <p className="budget-effective-note">Los meses anteriores no se modifican. El cambio se aplica al mes elegido y a los meses posteriores ya creados. Los meses futuros aún no creados heredarán este valor automáticamente.</p>
            <section className="history-filters global-date-filters">
              <div className="date-filter-intro">
                <strong>Periodo de consulta financiera</strong>
                <span>Consulta los movimientos dentro de estas fechas, sin cambiar el mes de vigencia del presupuesto.</span>
              </div>
              <div className="form-field">
                <label htmlFor="fechaDesdePresupuesto">Desde</label>
                <div className="date-picker-control">
                  <input ref={fechaDesdeRef} id="fechaDesdePresupuesto" type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={e => setFechaDesde(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha inicial" onClick={() => fechaDesdeRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="fechaHastaPresupuesto">Hasta</label>
                <div className="date-picker-control">
                  <input ref={fechaHastaRef} id="fechaHastaPresupuesto" type="date" value={fechaHasta} min={fechaDesde || undefined} max={fechaActual()} onChange={e => setFechaHasta(e.target.value)} />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha final" onClick={() => fechaHastaRef.current?.showPicker?.()}><span aria-hidden="true">▦</span></button>
                </div>
              </div>
            </section>
            <section className="monthly-range-summary">
              <div className="section-heading"><div><h3>Presupuestos por mes consultado</h3><p>Se muestran los presupuestos completos de cada mes que cruza el rango, sin prorratearlos.</p></div></div>
              {cargandoResumenRango ? <p className="empty-state">Consultando presupuestos por mes...</p> : resumenMensualRango.length === 0 ? <p className="empty-state">No hay meses disponibles dentro del rango seleccionado.</p> : (
                <div className="monthly-summary-grid">
                  {resumenMensualRango.map(item => (
                    <article className="monthly-summary-card monthly-budget-card" key={`presupuesto-${item.periodo}`}>
                      <div className="monthly-summary-title"><strong>{item.etiqueta}</strong><span>{item.periodo}</span></div>
                      <div className="monthly-summary-line"><span>Presupuesto mensual</span><strong>{formatoCOP.format(item.totalPresupuesto)}</strong></div>
                      <div className="monthly-summary-line"><span>Gastado dentro del rango</span><strong>{formatoCOP.format(item.totalGastado)}</strong></div>
                      <div className="monthly-summary-total"><span>Disponible del mes</span><strong>{formatoCOP.format(item.totalPresupuesto - item.totalGastado)}</strong></div>
                      <details className="monthly-detail-list"><summary>Ver detalle por rubro</summary>
                        {item.rubros.map(rubro => <div className="monthly-summary-line monthly-detail-line" key={rubro.id}><span>{rubro.nombre}<small>Gastado: {formatoCOP.format(rubro.gastado)}</small></span><strong>{formatoCOP.format(rubro.presupuesto)}</strong></div>)}
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="section-heading monthly-editor-heading"><div><h3>Editar presupuesto</h3><p>Los cambios se guardarán desde {nombreMes} en adelante.</p></div></div>
            {cargandoDatos ? <p className="empty-state">Consultando presupuestos...</p> : (
              <div className="budget-editor-list">
                {datos.rubros.filter(rubro => ['Mercado básico del hogar', 'Frutas y verduras', 'Proteína', 'Huevos', 'Pan', 'Leche', 'Agua', 'Energía (Luz)', 'Gas', 'Internet / TV / Cable'].includes(rubro.nombre)).map(rubro => (
                  <div className="budget-editor-row" key={rubro.id}>
                    <div className="budget-editor-info"><strong>{rubro.nombre}</strong><span>Gastado en {periodo}: {formatoCOP.format(rubro.gastado)}</span></div>
                    <div className="budget-editor-control"><label htmlFor={`presupuesto-${rubro.id}`}>Presupuesto mensual</label><div className="value-input-wrap"><span>$</span><input id={`presupuesto-${rubro.id}`} type="text" inputMode="numeric" value={presupuestosEdicion[rubro.id] ?? formatoNumero.format(rubro.presupuesto)} onChange={e => cambiarPresupuesto(rubro.id, e.target.value)} onBlur={() => setPresupuestosEdicion(actual => { const valor = actual[rubro.id]; return valor === undefined || valor === '' ? actual : { ...actual, [rubro.id]: formatoNumero.format(Number(valor)) } })} /></div></div>
                    <button type="button" className="primary-button budget-save-button" disabled={guardandoPresupuesto} onClick={() => guardarPresupuesto(rubro)}>{guardandoPresupuesto ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                ))}
                {datos.rubros.filter(rubro => ['Mercado básico del hogar', 'Frutas y verduras', 'Proteína', 'Huevos', 'Pan', 'Leche', 'Agua', 'Energía (Luz)', 'Gas', 'Internet / TV / Cable'].includes(rubro.nombre)).length === 0 && <p className="empty-state">No se encontraron los diez rubros presupuestados para este periodo.</p>}
              </div>
            )}
          </section>
        ) : seccion === 'reportes' ? (
          <>
            <section className="welcome-section"><div><h2>Reportes financieros</h2><p>Análisis de ingresos, gastos, aportes y evolución del hogar.</p></div></section>
            <section className="history-filters global-date-filters">
              <div className="date-filter-intro"><strong>Periodo del reporte</strong><span>Elige las fechas que deseas analizar.</span></div>
              <div className="form-field"><label htmlFor="fechaDesdeReporte">Desde</label><input id="fechaDesdeReporte" type="date" value={fechaDesde} max={fechaHasta} onChange={e => setFechaDesde(e.target.value)} /></div>
              <div className="form-field"><label htmlFor="fechaHastaReporte">Hasta</label><input id="fechaHastaReporte" type="date" value={fechaHasta} min={fechaDesde} max={fechaActual()} onChange={e => setFechaHasta(e.target.value)} /></div>
            </section>
            <section className="summary-grid">
              <article className="summary-card income-card"><span>INGRESOS</span><strong>{formatoCOP.format(datos.ingresos)}</strong></article>
              <article className="summary-card expense-card"><span>GASTOS</span><strong>{formatoCOP.format(datos.gastos)}</strong></article>
              <article className="summary-card balance-card"><span>SALDO</span><strong>{formatoCOP.format(saldo)}</strong></article>
              <article className="summary-card budget-card"><span>APORTES MENSUALES CONFIGURADOS</span><strong>{formatoCOP.format(totalAportesHogar)}</strong></article>
            </section>
            <section className="category-overview"><div className="section-heading"><div><h3>Ingresos por fuente</h3><p>Distribución de ingresos según la categoría registrada.</p></div></div>
              {ingresosPorFuente.length ? <div className="report-list">{ingresosPorFuente.map(x => <div className="report-line" key={x.nombre}><span>{x.nombre}</span><strong>{formatoCOP.format(x.valor)}</strong></div>)}</div> : <p className="empty-state">No hay ingresos registrados en este rango.</p>}
            </section>
            <section className="category-overview"><div className="section-heading"><div><h3>Gastos por categoría y rubro</h3><p>Detalle de la ejecución del periodo consultado.</p></div></div>
              {datos.categorias.filter(x => x.gastado > 0).length ? <div className="budget-category-list">{datos.categorias.filter(x => x.gastado > 0).map(c => <article className="budget-category" key={c.nombre}><div className="budget-category-heading"><strong>{c.nombre}</strong><span>{formatoCOP.format(c.gastado)}</span></div>{c.rubros.filter(r => r.gastado > 0).map(r => <div className="report-line report-subline" key={r.id}><span>{r.nombre}</span><strong>{formatoCOP.format(r.gastado)}</strong></div>)}</article>)}</div> : <p className="empty-state">No hay gastos registrados en este rango.</p>}
            </section>
            <section className="category-overview"><div className="section-heading"><div><h3>Evolución mensual</h3><p>Comparación de ingresos y gastos por mes.</p></div></div>
              {evolucionMensual.length ? <div className="monthly-chart">{evolucionMensual.map(x => <div className="monthly-chart-item" key={x.periodo}><strong>{x.etiqueta}</strong><div className="monthly-bars"><div className="monthly-bar income-bar" style={{height:`${Math.max(x.ingreso ? 4 : 0, x.ingreso/maxEvolucion*100)}%`}} title={`Ingresos: ${formatoCOP.format(x.ingreso)}`} /><div className="monthly-bar expense-bar" style={{height:`${Math.max(x.gasto ? 4 : 0, x.gasto/maxEvolucion*100)}%`}} title={`Gastos: ${formatoCOP.format(x.gasto)}`} /></div><span>Ingresos: {formatoCOP.format(x.ingreso)}</span><span>Gastos: {formatoCOP.format(x.gasto)}</span><b className={x.saldo >= 0 ? 'income-text' : 'expense-text'}>Saldo: {formatoCOP.format(x.saldo)}</b></div>)}</div> : <p className="empty-state">No hay meses para mostrar.</p>}
              <div className="chart-legend"><span><i className="legend-income"/> Ingresos</span><span><i className="legend-expense"/> Gastos</span></div>
            </section>
          </>
        ) : (
          <>
            <section className="welcome-section" id="dashboard">
              <div>
                <h2>¡Bienvenidos!</h2>
                <p>Este es el resumen financiero de su hogar.</p>
              </div>
              <span className="currency-tag">{hogar?.moneda || 'COP'}</span>
            </section>

            <section className="period-selector">
              <div>
                <label htmlFor="periodo">Mes de presupuesto y aportes</label>
                <strong>{nombreMes}</strong>
              </div>
              <input
                id="periodo"
                type="month"
                value={periodo}
                onChange={e => setPeriodo(e.target.value)}
              />
            </section>

            <section className="history-filters global-date-filters">
              <div className="date-filter-intro">
                <strong>Periodo de consulta financiera</strong>
                <span>Este rango se aplica al Dashboard, reportes e historial.</span>
              </div>
              <div className="form-field">
                <label htmlFor="fechaDesdeGlobal">Desde</label>
                <div className="date-picker-control">
                  <input
                    ref={fechaDesdeRef}
                    id="fechaDesdeGlobal"
                    type="date"
                    value={fechaDesde}
                    max={fechaHasta || undefined}
                    onChange={e => setFechaDesde(e.target.value)}
                  />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha inicial" onClick={() => fechaDesdeRef.current?.showPicker?.()}>
                    <span aria-hidden="true">▦</span>
                  </button>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="fechaHastaGlobal">Hasta</label>
                <div className="date-picker-control">
                  <input
                    ref={fechaHastaRef}
                    id="fechaHastaGlobal"
                    type="date"
                    value={fechaHasta}
                    min={fechaDesde || undefined}
                    max={fechaActual()}
                    onChange={e => setFechaHasta(e.target.value)}
                  />
                  <button type="button" className="date-picker-button" aria-label="Abrir calendario de fecha final" onClick={() => fechaHastaRef.current?.showPicker?.()}>
                    <span aria-hidden="true">▦</span>
                  </button>
                </div>
              </div>
            </section>

            {cargandoDatos ? (
              <section className="dashboard-placeholder">
                Consultando información financiera...
              </section>
            ) : (
              <>
                <section className="summary-grid">
                  <article className="summary-card income-card">
                    <span>INGRESOS DEL PERIODO</span>
                    <strong>{formatoCOP.format(datos.ingresos)}</strong>
                  </article>

                  <article className="summary-card expense-card">
                    <span>GASTOS DEL PERIODO</span>
                    <strong>{formatoCOP.format(datos.gastos)}</strong>
                  </article>

                  <article className="summary-card balance-card">
                    <span>SALDO DEL PERIODO</span>
                    <strong>{formatoCOP.format(saldo)}</strong>
                  </article>

                  <article className="summary-card budget-card">
                    <span>PRESUPUESTO MENSUAL</span>
                    <strong>{formatoCOP.format(datos.presupuesto)}</strong>
                  </article>
                </section>

                <section className="budget-overview">
                  <div className="section-heading">
                    <div>
                      <h3>Control del presupuesto</h3>
                      <p>Gastos del rango consultado frente al presupuesto del mes seleccionado.</p>
                    </div>
                    <strong>{porcentajePresupuesto.toFixed(1)}%</strong>
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(porcentajePresupuesto, 100)}%`,
                        background: porcentajePresupuesto > 100 ? '#df5148' : '#20a879',
                      }}
                    />
                  </div>

                  <div className="budget-details">
                    <span>Ejecutado: {formatoCOP.format(datos.gastos)}</span>
                    <span>Presupuesto: {formatoCOP.format(datos.presupuesto)}</span>
                  </div>
                </section>

                <section className="insight-grid">
                  <article className="category-overview"><div className="section-heading"><div><h3>Ingresos por fuente</h3><p>Origen de los ingresos registrados.</p></div></div>
                    {ingresosPorFuente.length ? ingresosPorFuente.map(x => <div className="report-line" key={x.nombre}><span>{x.nombre}</span><strong>{formatoCOP.format(x.valor)}</strong></div>) : <p className="empty-state">Sin ingresos registrados en el rango.</p>}
                  </article>
                  <article className="category-overview"><div className="section-heading"><div><h3>Aportes del hogar</h3><p>Valores configurados para {nombreMes}.</p></div></div>
                    <div className="report-line"><span>Cristian</span><strong>{formatoCOP.format(aportesCristian)}</strong></div>
                    <div className="report-line"><span>Jimena</span><strong>{formatoCOP.format(aportesJimena)}</strong></div>
                    <div className="report-line report-total"><span>Total aportes</span><strong>{formatoCOP.format(totalAportesHogar)}</strong></div>
                    <p className="report-note">Ingresos del periodo: {formatoCOP.format(datos.ingresos)} · Gastos: {formatoCOP.format(datos.gastos)}</p>
                  </article>
                </section>
                <section className="category-overview"><div className="section-heading"><div><h3>Evolución mensual</h3><p>Ingresos, gastos y saldo por cada mes incluido en el rango.</p></div><button type="button" className="text-link-button" onClick={() => setSeccion('reportes')}>Ver reportes</button></div>
                  {evolucionMensual.length ? <div className="monthly-chart">{evolucionMensual.map(x => <div className="monthly-chart-item" key={x.periodo}><strong>{x.etiqueta}</strong><div className="monthly-bars"><div className="monthly-bar income-bar" style={{height:`${Math.max(x.ingreso ? 4 : 0, x.ingreso/maxEvolucion*100)}%`}}/><div className="monthly-bar expense-bar" style={{height:`${Math.max(x.gasto ? 4 : 0, x.gasto/maxEvolucion*100)}%`}}/></div><span>Ing. {formatoCOP.format(x.ingreso)}</span><span>Gas. {formatoCOP.format(x.gasto)}</span><b className={x.saldo >= 0 ? 'income-text' : 'expense-text'}>Saldo {formatoCOP.format(x.saldo)}</b></div>)}</div> : <p className="empty-state">No hay meses para comparar.</p>}
                </section>

                <section className="category-overview" id="reportes">
                  <div className="section-heading">
                    <div>
                      <h3>Distribución de gastos por categoría</h3>
                      <p>Distribución de los gastos entre las fechas seleccionadas.</p>
                    </div>
                  </div>

                  {datos.gastos === 0 ? (
                    <p className="empty-state">
                      Aún no hay gastos registrados para mostrar la distribución.
                    </p>
                  ) : (
                    <div className="category-bars">
                      {datos.categorias
                        .filter(c => c.gastado > 0)
                        .sort((a, b) => b.gastado - a.gastado)
                        .map(categoria => {
                          const porcentaje = porcentajeGrafico(categoria.gastado, datos.gastos)

                          return (
                            <div className="category-item" key={categoria.nombre}>
                              <div className="category-item-heading">
                                <span>{categoria.nombre}</span>
                                <strong>{formatoCOP.format(categoria.gastado)}</strong>
                              </div>
                              <div className="category-track">
                                <div
                                  className="category-fill"
                                  style={{
                                    width: `${porcentaje}%`,
                                    background: coloresCategorias[
                                      datos.categorias.indexOf(categoria) % coloresCategorias.length
                                    ],
                                  }}
                                />
                              </div>
                              <span className="category-percentage">
                                {porcentaje.toFixed(1)}% del gasto total
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </section>

                <section className="category-overview" id="presupuestos">
                  <div className="section-heading">
                    <div>
                      <h3>Presupuesto por categoría y rubro</h3>
                      <p>Comparación entre lo presupuestado y lo gastado.</p>
                    </div>
                  </div>

                  {datos.rubros.length === 0 ? (
                    <p className="empty-state">No hay categorías de gastos configuradas.</p>
                  ) : (
                    <div className="budget-category-list">
                      {datos.categorias.map((categoria, indice) => (
                        <div className="budget-category" key={categoria.nombre}>
                          <div className="budget-category-heading">
                            <span
                              className="category-dot"
                              style={{ background: coloresCategorias[indice % coloresCategorias.length] }}
                            />
                            <strong>{categoria.nombre}</strong>
                            <span>
                              {formatoCOP.format(categoria.gastado)} / {formatoCOP.format(categoria.presupuesto)}
                            </span>
                          </div>

                          <div className="category-track">
                            <div
                              className="category-fill"
                              style={{
                                width: `${Math.min(porcentajeGrafico(categoria.gastado, categoria.presupuesto), 100)}%`,
                                background: categoria.gastado > categoria.presupuesto
                                  ? '#df5148'
                                  : coloresCategorias[indice % coloresCategorias.length],
                              }}
                            />
                          </div>

                          <div className="budget-category-details">
                            <span>
                              {categoria.presupuesto > 0
                                ? `${porcentajeGrafico(categoria.gastado, categoria.presupuesto).toFixed(1)}% ejecutado`
                                : 'Sin presupuesto asignado'}
                            </span>
                            <span>
                              {categoria.disponible >= 0
                                ? `Disponible: ${formatoCOP.format(categoria.disponible)}`
                                : `Excedido: ${formatoCOP.format(Math.abs(categoria.disponible))}`}
                            </span>
                          </div>

                          <div className="budget-rubros">
                            {categoria.rubros.map(rubro => (
                              <div className="budget-rubro" key={rubro.id}>
                                <div className="budget-rubro-heading">
                                  <span>{rubro.nombre}</span>
                                  <strong>{formatoCOP.format(rubro.gastado)}</strong>
                                </div>
                                <div className="budget-rubro-details">
                                  <span>Presupuesto: {formatoCOP.format(rubro.presupuesto)}</span>
                                  <span>
                                    {rubro.presupuesto > 0
                                      ? `${porcentajeGrafico(rubro.gastado, rubro.presupuesto).toFixed(1)}%`
                                      : 'No presupuestado'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="recent-movements" id="movimientos">
                  <div className="section-heading">
                    <div>
                      <h3>Movimientos recientes</h3>
                      <p>Movimientos registrados dentro del rango de fechas consultado.</p>
                    </div>
                    <button type="button" className="text-link-button" onClick={() => setSeccion('movimientos')}>
                      Ver historial · {datos.movimientos.length} registros
                    </button>
                  </div>

                  {datos.movimientos.length === 0 ? (
                    <p className="empty-state">
                      Aún no hay movimientos registrados en este periodo.
                    </p>
                  ) : (
                    <div className="movement-list">
                      {datos.movimientos.slice(0, 5).map(movimiento => (
                        <article className="movement-row" key={movimiento.id}>
                          <div>
                            <strong>{movimiento.descripcion}</strong>
                            <span>
                              {movimiento.fecha} · Registrado por{' '}
                              {nombresIntegrantes[movimiento.registrado_por] || 'Integrante'}
                            </span>
                          </div>
                          <strong className={movimiento.tipo === 'ingreso' ? 'income-text' : 'expense-text'}>
                            {movimiento.tipo === 'gasto' ? '-' : '+'}
                            {formatoCOP.format(Number(movimiento.valor))}
                          </strong>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
