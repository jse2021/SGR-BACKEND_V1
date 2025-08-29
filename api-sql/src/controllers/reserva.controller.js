
const axios = require('axios');
const { prisma } = require('../db');

// === helpers de fecha (ancla del día a -03 ===)
const TZ_OFFSET_HOURS = 3; // Argentina

function dateOnlyUTC(d) { // d puede ser ISO o 'YYYY-MM-DD'
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}
function anchorDateObj(dayUTC) { // objeto Date en 03:00Z
  return new Date(dayUTC.getTime() + TZ_OFFSET_HOURS * 3600 * 1000);
}
function anchorISO(dayUTC) { // string ISO 'YYYY-MM-DDT03:00:00.000Z'
  return anchorDateObj(dayUTC).toISOString();
}
// normaliza entrada del front
function parseFrontDay({ fecha, fechaCopia }) {
  if (fecha) return dateOnlyUTC(fecha);
  if (fechaCopia) return dateOnlyUTC(fechaCopia);
  throw new Error('Falta fecha o fechaCopia');
}



//====================================endpoint que usa el axios interno===========================
async function obtenerMontoPorEstado(req, res) {
  try {
    const { cancha, estado_pago } = req.body;

    // cancha por nombre -> saco configuración
    const canchaRow = await prisma.cancha.findUnique({ where: { nombre: cancha } });
    if (!canchaRow) return res.status(404).json({ ok: false, msg: 'Cancha no encontrada' });

    const conf = await prisma.configuracion.findUnique({ where: { canchaId: canchaRow.id } });
    if (!conf) return res.status(404).json({ ok: false, msg: 'La cancha no tiene configuración' });

    const monto_cancha = Number(conf.monto_cancha);
    const monto_sena   = Number(conf.monto_sena);

    // tu front usa "monto" y a veces usa por separado
    let monto = 0;
    if (estado_pago === 'TOTAL') monto = monto_cancha;
    if (estado_pago === 'SEÑA')  monto = monto_sena;

    return res.json({ ok: true, monto, monto_cancha, monto_sena });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error al obtener monto' });
  }
}



// ============================================== CREAR RESERVA===========================================
async function crearReserva(req, res) {
  try {
    // 1) Body del front (igual a Mongo)
    const {
      cliente: clienteRequest,
      cancha: canchaRequest,
      estado_pago: estadoPagoRequest,
      fecha: fechaRequest,
      fechaCopia: fechaCopiaRequest,
      hora: horaRequest,
      forma_pago,
      observacion,
      title,
      start,
      end,
    } = req.body;

    const uid = req.uid ?? req.id ?? null;

    // 2) Validaciones base (mismos mensajes)
    if (!clienteRequest) return res.status(400).json({ ok: false, msg: 'No existe cliente' });
    if (!canchaRequest)  return res.status(400).json({ ok: false, msg: 'No existe cancha' });
    if (!fechaRequest && !fechaCopiaRequest) {
      return res.status(400).json({ ok: false, msg: 'La fecha es obligatoria' });
    }
    if (!horaRequest) return res.status(400).json({ ok: false, msg: 'El horario no puede estar vacio' });
    if (!estadoPagoRequest) return res.status(400).json({ ok: false, msg: 'Debe seleccionar un estado de pago' });

    // 3) Cargas paralelas 
    const [configuraciones, cliente, cancha] = await Promise.all([
      prisma.configuracion.findMany({ include: { cancha: true } }),
      prisma.cliente.findUnique({ where: { dni: String(clienteRequest) } }),
      prisma.cancha.findUnique({ where: { nombre: canchaRequest } }),
    ]);

    if (!cliente) return res.status(400).json({ ok: false, msg: 'No existe cliente' });

    const existeCancha = configuraciones.find((c) => c.cancha?.nombre === canchaRequest);
    if (!existeCancha) return res.status(400).json({ ok: false, msg: 'No existe cancha' });

    // 4) Normalización de fecha idéntica a Mongo:
    //    - fechaCopia = DATE (00:00Z)
    //    - hora = "HH:mm"
    //    - fecha/start/end = ancla del día a 03:00Z (no la hora de juego)
    const dayUTC  = parseFrontDay({ fecha: fechaRequest, fechaCopia: fechaCopiaRequest });
    const horaStr = (horaRequest || '00:00').padStart(5, '0');

    // 5) reservasDelDia (compat con tu lógica; no se usa luego)
    const reservasRegistradas = await prisma.reserva.findMany({
      where: {
        fechaCopia: dayUTC,
        canchaId: cancha.id,
        OR: [{ estado: 'activo' }, { estado: { equals: '' } }],
      },
      select: { id: true, hora: true },
    });
    const reservasDelDia = reservasRegistradas.filter(r => r.hora === horaStr);
    // (queda para depurar, como en tu 1.0)

    // 6) Llamado interno para monto (con x-token); fallback si falla
    const token = req.header('x-token') || '';
    const API_BASE = process.env.API_ORIGIN_BASE || 'http://localhost:5000';
    let monto = 0;
    try {
      const { data } = await axios.post(
        `${API_BASE}/reserva/obtener-monto`,
        { cancha: canchaRequest, estado_pago: estadoPagoRequest },
        { headers: { 'x-token': token } }
      );
      if (!data.ok) return res.status(400).json({ ok: false, msg: 'Error al obtener el monto' });
      monto = Number(data.monto || 0);
    } catch (err) {
      const conf = await prisma.configuracion.findUnique({ where: { canchaId: cancha.id } });
      if (!conf) return res.status(400).json({ ok: false, msg: 'Error al obtener el monto' });
      if (estadoPagoRequest === 'TOTAL') monto = Number(conf.monto_cancha);
      else if (estadoPagoRequest === 'SEÑA') monto = Number(conf.monto_sena);
      else monto = 0;
    }

    // 7) Montos automáticos
    const monto_cancha = estadoPagoRequest === 'TOTAL' ? monto : 0;
    const monto_sena   = estadoPagoRequest === 'SEÑA'  ? monto : 0;

    // 8) Usuario (texto + id)
    const usuario = uid ? await prisma.usuario.findUnique({ where: { id: Number(uid) } }) : null;

    // 9) Colisión de turno (slot ocupado)
    const ocupado = await prisma.reserva.findFirst({
      where: {
        canchaId: cancha.id,
        fechaCopia: dayUTC,
        hora: horaStr,
        estado: 'activo',
      },
      select: { id: true },
    });
    if (ocupado) {
      return res.status(409).json({ ok: false, msg: 'Turno ocupado para esa cancha, fecha y hora' });
    }

    // 10) Crear + histórico v1 (transacción)
    let creada;
    await prisma.$transaction(async (tx) => {
      creada = await tx.reserva.create({
        data: {
          clienteId: cliente.id,
          canchaId: cancha.id,
          usuarioId: usuario?.id ?? null,
          user: usuario?.user ?? null,

          estado_pago: estadoPagoRequest,
          forma_pago,
          estado: 'activo',

          monto_cancha,
          monto_sena,

          fecha: anchorDateObj(dayUTC),    // 03:00Z (como Mongo)
          fechaCopia: dayUTC,              // DATE puro (día)
          hora: horaStr,                   // "HH:mm"

          title: title ?? canchaRequest,
          start: start ? new Date(start) : anchorDateObj(dayUTC), // 03:00Z
          end:   end   ? new Date(end)   : anchorDateObj(dayUTC), // 03:00Z

          nombreCliente: cliente.nombre,
          apellidoCliente: cliente.apellido,
          observacion: observacion ?? null,
        },
      });

      await tx.reservaHist.create({
        data: {
          reservaId: creada.id,
          version: 1,
          action: 'CREAR',
          changedById: usuario?.id ?? null,

          clienteId: creada.clienteId,
          canchaId: creada.canchaId,
          usuarioId: creada.usuarioId,
          estado_pago: creada.estado_pago,
          forma_pago: creada.forma_pago,
          estado: creada.estado,
          monto_cancha: creada.monto_cancha,
          monto_sena: creada.monto_sena,
          fecha: creada.fecha,
          fechaCopia: creada.fechaCopia,
          hora: creada.hora,
          title: creada.title,
          start: creada.start,
          end: creada.end,
          nombreCliente: creada.nombreCliente,
          apellidoCliente: creada.apellidoCliente,
          user: creada.user,
          observacion: creada.observacion,
        },
      });
    });

    // 11) Email (no romper si falla)
    try {
      if (typeof enviarCorreoReserva === 'function' && cliente.email) {
        const fechaFormateada = new Date(creada.fechaCopia).toLocaleDateString('es-AR');
        await enviarCorreoReserva(cliente.email, {
          cancha: canchaRequest,
          fecha: fechaFormateada,
          hora: creada.hora,
          nombre: `${creada.nombreCliente} ${creada.apellidoCliente}`,
          estado: creada.estado_pago,
          observacion: creada.observacion || '',
        });
      }
    } catch (e) {
      console.warn('Email de reserva falló:', e?.message);
    }

    // 12) Respuesta igual a Mongo (montos como número y fechas ancladas a 03:00Z)
    const reservaOut = {
      ...creada,
      monto_cancha: Number(creada.monto_cancha || 0),
      monto_sena: Number(creada.monto_sena || 0),
      fecha: anchorDateObj(creada.fechaCopia),
      start: anchorDateObj(creada.fechaCopia),
      end:   anchorDateObj(creada.fechaCopia),
      fechaCopia: anchorDateObj(creada.fechaCopia),
    };

    return res.status(201).json({
      ok: true,
      msg: 'Reserva registrada exitosamente',
      reserva: reservaOut,
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ ok: false, msg: 'Turno ocupado para esa cancha, fecha y hora' });
    }
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}

// para consultar segun fecha, los horarios disponibles de cancha indicada
async function obtenerHorasDisponibles(req, res) {
  try {
    const { fecha, cancha, reservaId } = req.body;

    if (!fecha || !cancha) {
      return res.status(400).json({
        ok: false,
        msg: 'Faltan datos: fecha y/o cancha',
      });
    }

    // buscamos la cancha por NOMBRE 
    const canchaRow = await prisma.cancha.findUnique({ where: { nombre: cancha } });
    if (!canchaRow) {
      return res.status(404).json({ ok: false, msg: 'Cancha no encontrada' });
    }

    // normalizo fecha del front a DATE puro (00:00 UTC)
    const fechaDia = new Date(`${fecha}T00:00:00Z`);

    const where = {
      fechaCopia: fechaDia,
      canchaId: canchaRow.id,
      OR: [{ estado: 'activo' }, { estado: { equals: '' } }],
    };

    // excluir la propia reserva cuando estás editando
    const idNum = Number(reservaId);
    if (reservaId !== undefined && Number.isFinite(idNum) && idNum > 0) {
      where.NOT = { id: idNum };
    }

    const reservasRegistradas = await prisma.reserva.findMany({
      where,
      select: { hora: true },
      orderBy: { hora: 'asc' },
    });

    const horasOcupadas = reservasRegistradas.map((r) => r.hora);

    // el mismo set estático de horas que usás en el front/backend actual
    const todasLasHoras = [
      '08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00',
      '16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00',
    ];

    const horasDisponibles = todasLasHoras.filter((h) => !horasOcupadas.includes(h));

    return res.status(200).json({
      ok: true,
      horasDisponibles,
    });
  } catch (error) {
    console.error('Error en obtenerHorasDisponibles:', error);
    return res.status(500).json({
      ok: false,
      msg: 'Error interno al obtener horarios disponibles',
    });
  }
}

//==========================================================================================================
module.exports = {
  crearReserva,
  obtenerMontoPorEstado, 
  obtenerHorasDisponibles
};
