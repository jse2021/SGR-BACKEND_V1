const axios = require("axios");
const { prisma } = require("../db");
const {
  enviarCorreoReserva,
  enviarCorreoReservaActualizada,
  enviarCorreoReservaEliminada,
} = require("../helpers/mailer");

// === helpers de fecha (ancla del día a -03 ===)
const TZ_OFFSET_HOURS = 3; // Argentina

function dateOnlyUTC(d) {
  // d puede ser ISO o 'YYYY-MM-DD'
  const x = new Date(d);
  return new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
  );
}
function anchorDateObj(dayUTC) {
  // objeto Date en 03:00Z
  return new Date(dayUTC.getTime() + TZ_OFFSET_HOURS * 3600 * 1000);
}
function anchorISO(dayUTC) {
  // string ISO 'YYYY-MM-DDT03:00:00.000Z'
  return anchorDateObj(dayUTC).toISOString();
}
// normaliza entrada del front
function parseFrontDay({ fecha, fechaCopia }) {
  if (fecha) return dateOnlyUTC(fecha);
  if (fechaCopia) return dateOnlyUTC(fechaCopia);
  throw new Error("Falta fecha o fechaCopia");
}

//====================================endpoint que usa el axios interno===========================
async function obtenerMontoPorEstado(req, res) {
  try {
    const { cancha, estado_pago } = req.body;

    // buscar cancha ACTIVA por nombre (ya no hay unique)
    const nombreTrim = String(cancha).trim();
    const canchaRow = await prisma.cancha.findFirst({
      where: {
        estado: "activo",
        nombre: { equals: nombreTrim, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!canchaRow) {
      return res
        .status(404)
        .json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    const conf = await prisma.configuracion.findUnique({
      where: { canchaId: canchaRow.id },
    });
    if (!conf)
      return res
        .status(404)
        .json({ ok: false, msg: "La cancha no tiene configuración" });

    const monto_cancha = Number(conf.monto_cancha);
    const monto_sena = Number(conf.monto_sena);

    // tu front usa "monto" y a veces usa por separado
    let monto = 0;
    if (estado_pago === "TOTAL") monto = monto_cancha;
    if (estado_pago === "SEÑA") monto = monto_sena;

    return res.json({ ok: true, monto, monto_cancha, monto_sena });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: "Error al obtener monto" });
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
    if (!clienteRequest)
      return res.status(400).json({ ok: false, msg: "No existe cliente" });
    if (!canchaRequest)
      return res.status(400).json({ ok: false, msg: "No existe cancha" });
    if (!fechaRequest && !fechaCopiaRequest) {
      return res
        .status(400)
        .json({ ok: false, msg: "La fecha es obligatoria" });
    }
    if (!horaRequest)
      return res
        .status(400)
        .json({ ok: false, msg: "El horario no puede estar vacio" });
    if (!estadoPagoRequest)
      return res
        .status(400)
        .json({ ok: false, msg: "Debe seleccionar un estado de pago" });

    // 3) Resolver cancha y cliente (SOLO ACTIVOS) + configuración
    const nombreCancha = String(canchaRequest || "").trim();
    const dniCliente = String(clienteRequest || "").trim();

    const [configuraciones, clienteRow, canchaRow] = await Promise.all([
      prisma.configuracion.findMany({ include: { cancha: true } }),
      prisma.cliente.findFirst({
        where: { estado: "activo", dni: dniCliente },
        select: { id: true, nombre: true, apellido: true, email: true },
      }),

      prisma.cancha.findFirst({
        where: {
          estado: "activo",
          nombre: { equals: nombreCancha, mode: "insensitive" },
        },
        select: { id: true, nombre: true },
      }),
    ]);

    if (!clienteRow) {
      return res
        .status(400)
        .json({ ok: false, msg: "No existe cliente (activo)" });
    }
    if (!canchaRow) {
      return res
        .status(400)
        .json({ ok: false, msg: "No existe cancha (activa)" });
    }

    // 3.1) Si el front ya envía montos, usalos y evitá axios/fallback
    const bodyMontoCancha = Number(req.body?.monto_cancha);
    const bodyMontoSena = Number(req.body?.monto_sena);

    let importeFinal = null;
    if (estadoPagoRequest === "TOTAL" && Number.isFinite(bodyMontoCancha)) {
      importeFinal = bodyMontoCancha;
    } else if (estadoPagoRequest === "SEÑA" && Number.isFinite(bodyMontoSena)) {
      importeFinal = bodyMontoSena;
    }

    // 4) Normalización de fecha + hora (seguro para ISO o YYYY-MM-DD)
    const fechaDiaUTC = dateOnlyUTC(fechaRequest || fechaCopiaRequest);
    const horaStr = String(horaRequest || "00:00").padStart(5, "0");

    // 5) reservasDelDia (compat con tu lógica; no se usa luego)
    const reservasRegistradas = await prisma.reserva.findMany({
      where: {
        fechaCopia: fechaDiaUTC, // antes: dayUTC
        canchaId: canchaRow.id, // antes: cancha.id
        OR: [{ estado: "activo" }, { estado: { equals: "" } }],
      },
      select: { id: true, hora: true },
    });
    const reservasDelDia = reservasRegistradas.filter(
      (r) => r.hora === horaStr
    );

    // 6) Llamado interno para monto (con x-token); fallback si falla
    if (importeFinal === null) {
      const token = req.header("x-token") || "";
      const API_BASE = process.env.API_ORIGIN_BASE || "http://localhost:5000";
      try {
        const { data } = await axios.post(
          `${API_BASE}/reserva/obtener-monto`,
          { cancha: canchaRequest, estado_pago: estadoPagoRequest },
          { headers: { "x-token": token } }
        );
        if (!data.ok) throw new Error("monto-no-disponible");
        importeFinal = Number(data.monto || 0);
      } catch {
        const confFallback = await prisma.configuracion.findUnique({
          where: { canchaId: canchaRow.id },
        });
        if (!confFallback) {
          return res.status(400).json({
            ok: false,
            msg: "La cancha no tiene configuración de precios",
          });
        }
        if (estadoPagoRequest === "TOTAL")
          importeFinal = Number(confFallback.monto_cancha || 0);
        else if (estadoPagoRequest === "SEÑA")
          importeFinal = Number(confFallback.monto_sena || 0);
        else importeFinal = 0;
      }
    }

    // 7) Montos automáticos
    const monto_cancha = estadoPagoRequest === "TOTAL" ? importeFinal : 0;
    const monto_sena = estadoPagoRequest === "SEÑA" ? importeFinal : 0;

    // 8) Usuario (texto + id)
    const usuario = uid
      ? await prisma.usuario.findUnique({ where: { id: Number(uid) } })
      : null;

    // 9) Colisión de turno (slot ocupado)
    const ocupado = await prisma.reserva.findFirst({
      where: {
        canchaId: canchaRow.id, // <-- antes: cancha.id
        fechaCopia: fechaDiaUTC, // <-- antes: dayUTC
        hora: horaStr,
        estado: "activo",
      },
      select: { id: true },
    });
    if (ocupado) {
      return res.status(409).json({
        ok: false,
        msg: "Turno ocupado para esa cancha, fecha y hora",
      });
    }

    // 10) Crear + histórico v1 (transacción)
    let creada;
    await prisma.$transaction(async (tx) => {
      creada = await tx.reserva.create({
        data: {
          clienteId: clienteRow.id,
          canchaId: canchaRow.id,

          usuarioId: usuario?.id ?? null,
          user: usuario?.user ?? null,

          estado_pago: estadoPagoRequest,
          forma_pago,
          estado: "activo",

          monto_cancha: estadoPagoRequest === "TOTAL" ? importeFinal : 0,
          monto_sena: estadoPagoRequest === "SEÑA" ? importeFinal : 0,

          fecha: anchorDateObj(fechaDiaUTC),
          fechaCopia: fechaDiaUTC,
          hora: horaStr,

          title: title ?? canchaRequest,
          start: start ? new Date(start) : anchorDateObj(fechaDiaUTC),
          end: end ? new Date(end) : anchorDateObj(fechaDiaUTC),

          nombreCliente: clienteRow.nombre,
          apellidoCliente: clienteRow.apellido,
          observacion: observacion ?? null,
        },
      });

      await tx.reservaHist.create({
        data: {
          reservaId: creada.id,
          version: 1,
          action: "CREAR",
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
      if (typeof enviarCorreoReserva === "function" && clienteRow.email) {
        const fechaFormateada = anchorDateObj(
          creada.fechaCopia
        ).toLocaleDateString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        });
        await enviarCorreoReserva(clienteRow.email, {
          cancha: canchaRequest,
          fecha: fechaFormateada,
          hora: creada.hora,
          nombre: `${creada.nombreCliente} ${creada.apellidoCliente}`,
          estado: creada.estado_pago,
          observacion: creada.observacion || "",
        });
      }
    } catch (e) {
      console.warn("Email de reserva falló:", e?.message);
    }

    // 12) Respuesta igual a Mongo (montos como número y fechas ancladas a 03:00Z)
    const reservaOut = {
      ...creada,
      monto_cancha: Number(creada.monto_cancha || 0),
      monto_sena: Number(creada.monto_sena || 0),
      fecha: anchorDateObj(creada.fechaCopia),
      start: anchorDateObj(creada.fechaCopia),
      end: anchorDateObj(creada.fechaCopia),
      fechaCopia: anchorDateObj(creada.fechaCopia),
    };

    return res.status(201).json({
      ok: true,
      msg: "Reserva registrada exitosamente",
      reserva: reservaOut,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        ok: false,
        msg: "Turno ocupado para esa cancha, fecha y hora",
      });
    }
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

// para consultar segun fecha, los horarios disponibles de cancha indicada
async function obtenerHorasDisponibles(req, res) {
  try {
    const { fecha, cancha, reservaId } = req.body;

    if (!fecha || !cancha) {
      return res.status(400).json({
        ok: false,
        msg: "Faltan datos: fecha y/o cancha",
      });
    }

    // cancha por NOMBRE, pero SOLO ACTIVA (findFirst; ya no hay unique por nombre)
    const canchaRow = await prisma.cancha.findFirst({
      where: { nombre: String(cancha).trim(), estado: "activo" },
      select: { id: true },
    });
    if (!canchaRow) {
      return res
        .status(404)
        .json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    const fechaDia = dateOnlyUTC(fecha);
    const where = {
      fechaCopia: fechaDia,
      canchaId: canchaRow.id,
      OR: [{ estado: "activo" }, { estado: { equals: "" } }],
    };

    // excluir la propia reserva cuando estás editando
    const idNum = Number(reservaId);
    if (reservaId !== undefined && Number.isFinite(idNum) && idNum > 0) {
      where.NOT = { id: idNum };
    }

    const reservasRegistradas = await prisma.reserva.findMany({
      where,
      select: { hora: true },
      orderBy: { hora: "asc" },
    });

    const horasOcupadas = reservasRegistradas.map((r) => r.hora);
    const todasLasHoras = [
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
      "23:00",
    ];

    const horasDisponibles = todasLasHoras.filter(
      (h) => !horasOcupadas.includes(h)
    );

    return res.status(200).json({
      ok: true,
      horasDisponibles,
    });
  } catch (error) {
    console.error("Error en obtenerHorasDisponibles:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error interno al obtener horarios disponibles",
    });
  }
}

// ============================================== ACTUALIZAR_RESERVA===========================================
async function actualizarReserva(req, res) {
  const id = Number(req.params.id);
  const { fecha_copia } = req.body;

  try {
    // 1) No permitimos cambiar la fecha del día
    if (fecha_copia) {
      return res
        .status(400)
        .json({ ok: false, msg: "No es posible cambiar la fecha" });
    }
    // 2) Buscar reserva existente
    const actual = await prisma.reserva.findUnique({ where: { id } });
    if (!actual) {
      return res.status(400).json({ ok: false, msg: "La reserva no existe" });
    }
    // 3) Preparar cambios
    const nueva = { ...req.body };

    // si no mandan cancha, mantener la actual
    if (!nueva.cancha) {
      // en SQL guardamos title=nombre de cancha; por compat:
      const c = await prisma.cancha.findUnique({
        where: { id: actual.canchaId },
      });
      nueva.cancha = c?.nombre || actual.title;
    }
    // 4) Resolver cancha de destino (por NOMBRE) y cliente (por DNI) si cambian
    // 4) Resolver cancha de destino (por NOMBRE) y cliente (por DNI) si cambian
    const destCancha = await prisma.cancha.findFirst({
      where: {
        estado: "activo",
        nombre: { equals: String(nueva.cancha).trim(), mode: "insensitive" },
      },
      select: { id: true, nombre: true },
    });
    if (!destCancha) {
      return res
        .status(400)
        .json({ ok: false, msg: "No existe cancha (activa)" });
    }

    let destCliente = null;
    if (nueva.cliente) {
      destCliente = await prisma.cliente.findFirst({
        where: { estado: "activo", dni: String(nueva.cliente).trim() },
        select: { id: true, nombre: true, apellido: true },
      });
      if (!destCliente) {
        return res
          .status(404)
          .json({ ok: false, msg: "Cliente no encontrado (activo)" });
      }
    }

    // 5) Hora destino (si no mandan, mantener)
    const nuevaHora = (nueva.hora || actual.hora || "00:00").padStart(5, "0");

    // 6) Si cambian cancha u estado_pago -> recalcular montos
    let estadoPago = nueva.estado_pago ?? actual.estado_pago;
    let monto_cancha = actual.monto_cancha;
    let monto_sena = actual.monto_sena;

    if (
      (nueva.estado_pago && nueva.cancha) ||
      (nueva.estado_pago && !nueva.cancha) ||
      (!nueva.estado_pago && nueva.cancha)
    ) {
      try {
        const token = req.header("x-token") || "";
        const API_BASE = process.env.API_ORIGIN_BASE || "http://localhost:5000";
        const { data } = await axios.post(
          `${API_BASE}/reserva/obtener-monto`,
          { estado_pago: estadoPago, cancha: nueva.cancha },
          { headers: { "x-token": token } }
        );

        if (!data.ok) throw new Error("Monto no disponible");
        const monto = Number(data.monto || 0);

        if (estadoPago === "TOTAL") {
          monto_cancha = monto;
          monto_sena = 0;
        } else if (estadoPago === "SEÑA") {
          monto_sena = monto;
          monto_cancha = 0;
        } else {
          monto_cancha = 0;
          monto_sena = 0;
        }
      } catch {
        // fallback: leer configuración directo
        const conf = await prisma.configuracion.findUnique({
          where: { canchaId: destCancha.id },
        });
        const mC = Number(conf?.monto_cancha || 0);
        const mS = Number(conf?.monto_sena || 0);
        if (estadoPago === "TOTAL") {
          monto_cancha = mC;
          monto_sena = 0;
        } else if (estadoPago === "SEÑA") {
          monto_sena = mS;
          monto_cancha = 0;
        } else {
          monto_cancha = 0;
          monto_sena = 0;
        }
      }
    }

    // 7) Chequeo de colisión SOLO si cambia la combinación (cancha/hora)
    const cambiaCancha = destCancha.id !== actual.canchaId;
    const cambiaHora = nuevaHora !== actual.hora;
    if (cambiaCancha || cambiaHora) {
      const ocupado = await prisma.reserva.findFirst({
        where: {
          id: { not: actual.id },
          canchaId: destCancha.id,
          fechaCopia: actual.fechaCopia, // el día NO cambia en V1
          hora: nuevaHora,
          estado: "activo",
        },
        select: { id: true },
      });
      if (ocupado) {
        return res.status(409).json({
          ok: false,
          msg: "Turno ocupado para esa cancha, fecha y hora",
        });
      }
    }

    // 8) Usuario (para .user)
    const uid = req.uid ?? req.id ?? null;
    const usuario = uid
      ? await prisma.usuario.findUnique({ where: { id: Number(uid) } })
      : null;

    // 9) Construir data de update (solo campos reales como en tu "camposValidos")
    const dataUpdate = {
      // relaciones si cambiaron
      canchaId: destCancha.id,
      clienteId: destCliente ? destCliente.id : undefined,

      // básicos
      cliente: undefined, // NO existe esta columna; tu front manda DNI pero en SQL usamos clienteId

      estado_pago: estadoPago,
      monto_cancha,
      monto_sena,
      hora: nuevaHora,
      forma_pago: nueva.forma_pago ?? actual.forma_pago,
      observacion: nueva.observacion ?? actual.observacion,

      // compat calendario y nombres:
      title: nueva.title ?? destCancha.nombre,

      // fecha/start/end NO cambian de día; reanclamos al mismo día (03:00Z)
      fecha: anchorDateObj(actual.fechaCopia),
      start: anchorDateObj(actual.fechaCopia),
      end: anchorDateObj(actual.fechaCopia),

      // user visible y datos del cliente (si mandaron otro DNI, refrescamos nombres)
      user: nueva.user ?? usuario?.user ?? actual.user,
      nombreCliente: destCliente
        ? destCliente.nombre
        : nueva.nombreCliente ?? actual.nombreCliente,
      apellidoCliente: destCliente
        ? destCliente.apellido
        : nueva.apellidoCliente ?? actual.apellidoCliente,
    };

    // limpiar undefined (Prisma no acepta undefined en algunas versiones)
    Object.keys(dataUpdate).forEach(
      (k) => dataUpdate[k] === undefined && delete dataUpdate[k]
    );

    // 10) Actualizar + histórico (transacción)
    let updated;
    await prisma.$transaction(async (tx) => {
      updated = await tx.reserva.update({
        where: { id: actual.id },
        data: dataUpdate,
      });

      const nextVersion =
        (await tx.reservaHist.count({ where: { reservaId: actual.id } })) + 1;
      await tx.reservaHist.create({
        data: {
          reservaId: updated.id,
          version: nextVersion,
          action: "ACTUALIZAR",
          changedById: usuario?.id ?? null,

          clienteId: updated.clienteId,
          canchaId: updated.canchaId,
          usuarioId: updated.usuarioId,
          estado_pago: updated.estado_pago,
          forma_pago: updated.forma_pago,
          estado: updated.estado,
          monto_cancha: updated.monto_cancha,
          monto_sena: updated.monto_sena,
          fecha: updated.fecha,
          fechaCopia: updated.fechaCopia,
          hora: updated.hora,
          title: updated.title,
          start: updated.start,
          end: updated.end,
          nombreCliente: updated.nombreCliente,
          apellidoCliente: updated.apellidoCliente,
          user: updated.user,
          observacion: updated.observacion,
        },
      });
    });

    // 11) Email (formateo con ancla 03:00Z como ya hicimos en crear)
    try {
      // email del cliente (si cambiaron el DNI usamos el nuevo)
      const cli = await prisma.cliente.findUnique({
        where: { id: updated.clienteId },
      });
      if (typeof enviarCorreoReservaActualizada === "function" && cli?.email) {
        const fechaFormateada = anchorDateObj(
          updated.fechaCopia
        ).toLocaleDateString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        });
        await enviarCorreoReservaActualizada(cli.email, {
          cancha: (
            await prisma.cancha.findUnique({ where: { id: updated.canchaId } })
          ).nombre,
          fecha: fechaFormateada,
          hora: updated.hora,
          nombre: `${updated.nombreCliente} ${updated.apellidoCliente}`,
          estado: updated.estado_pago,
          observacion: updated.observacion || "",
        });
      }
    } catch (e) {
      console.warn("Email de reserva actualizada falló:", e?.message);
    }

    // 12)Formateo respuesta antes de mandar al front
    const out = {
      ...updated,
      monto_cancha: Number(updated.monto_cancha || 0),
      monto_sena: Number(updated.monto_sena || 0),
      fecha: anchorDateObj(updated.fechaCopia),
      start: anchorDateObj(updated.fechaCopia),
      end: anchorDateObj(updated.fechaCopia),
      fechaCopia: anchorDateObj(updated.fechaCopia),
    };

    return res
      .status(200)
      .json({ ok: true, reserva: out, msg: "Reserva actualizada" });
  } catch (error) {
    if (error.code === "P2002") {
      // por si el índice único parcial se dispara
      return res.status(409).json({
        ok: false,
        msg: "Turno ocupado para esa cancha, fecha y hora",
      });
    }
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
// ============================================== CANCELAR_RESERVA===========================================
async function eliminarReserva(req, res) {
  const id = Number(req.params.id);

  try {
    // 1) Buscar reserva
    const reserva = await prisma.reserva.findUnique({ where: { id } });
    if (!reserva) {
      return res.status(400).json({ ok: false, msg: "La reserva no existe" });
    }
    // 2) Si ya estaba inactiva, respondemos igual que en Mongo
    if (reserva.estado === "inactivo") {
      return res.json({ ok: true, msg: "Reserva Eliminada" });
    }
    // 3) Usuario que hace el cambio (para histórico)
    const uid = req.uid ?? req.id ?? null;

    // 4) Transacción: marcar inactivo + histórico "CANCELAR"
    let borrada;
    await prisma.$transaction(async (tx) => {
      borrada = await tx.reserva.update({
        where: { id },
        data: { estado: "inactivo" },
      });

      const nextVersion =
        (await tx.reservaHist.count({ where: { reservaId: id } })) + 1;

      await tx.reservaHist.create({
        data: {
          reservaId: id,
          version: nextVersion,
          action: "CANCELAR",
          changedById: uid ? Number(uid) : null,

          // snapshot completo (igual que en crear/actualizar)
          clienteId: borrada.clienteId,
          canchaId: borrada.canchaId,
          usuarioId: borrada.usuarioId,
          estado_pago: borrada.estado_pago,
          forma_pago: borrada.forma_pago,
          estado: borrada.estado,
          monto_cancha: borrada.monto_cancha,
          monto_sena: borrada.monto_sena,
          fecha: borrada.fecha,
          fechaCopia: borrada.fechaCopia,
          hora: borrada.hora,
          title: borrada.title,
          start: borrada.start,
          end: borrada.end,
          nombreCliente: borrada.nombreCliente,
          apellidoCliente: borrada.apellidoCliente,
          user: borrada.user,
          observacion: borrada.observacion,
        },
      });
    });
    // 5) Email al cliente (con ancla 03:00Z para la fecha)
    try {
      const cli = await prisma.cliente.findUnique({
        where: { id: reserva.clienteId },
      });
      const cancha = await prisma.cancha.findUnique({
        where: { id: reserva.canchaId },
      });

      if (typeof enviarCorreoReservaEliminada === "function" && cli?.email) {
        const fechaFormateada = anchorDateObj(
          reserva.fechaCopia
        ).toLocaleDateString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        });

        await enviarCorreoReservaEliminada(cli.email, {
          cancha: cancha?.nombre || reserva.title || "",
          fecha: fechaFormateada,
          hora: reserva.hora,
          nombre: `${reserva.nombreCliente} ${reserva.apellidoCliente}`,
          estado: reserva.estado_pago,
          observacion: reserva.observacion || "",
        });
      }
    } catch (e) {
      console.warn("Email de reserva eliminada falló:", e?.message);
    }
    // 6) Respuesta (como en Mongo)
    return res.json({ ok: true, msg: "Reserva Eliminada" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

// ============================================== SECCIÓN_CONSULTAS===========================================
//================================================TRAIGO_POR_FECHA_CANCHA====================================

async function getReservaFechaCancha(req, res) {
  try {
    const { fecha, cancha } = req.params;

    // normalizo el día a DATE (00:00Z)
    const dayUTC = new Date(`${fecha}T00:00:00Z`);

    // paginación (compat Mongo: ?desde & ?limite) + soporte page opcional
    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit)); // cap de seguridad

    // cancha por NOMBRE (SOLO ACTIVA) – nombre ya no es único
    const canchaRow = await prisma.cancha.findFirst({
      where: {
        estado: "activo",
        nombre: { equals: String(cancha).trim(), mode: "insensitive" },
      },
      select: { id: true, nombre: true },
    });
    if (!canchaRow) {
      return res
        .status(404)
        .json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    // where base: mismo día + cancha + solo ACTIVAS
    const where = {
      fechaCopia: dayUTC,
      canchaId: canchaRow.id,
      estado: "activo",
    };

    // total para paginación
    const total = await prisma.reserva.count({ where });

    // fetch página
    const rows = await prisma.reserva.findMany({
      where,
      orderBy: [{ hora: "asc" }, { id: "asc" }],
      skip,
      take,
      include: {
        cliente: { select: { dni: true, nombre: true, apellido: true } },
      },
    });

    // salida formateada (montos a Number y fechas con ancla 03:00Z)
    const reservas = rows.map((r) => ({
      ...r,
      // cancha: cancha?.nombre ?? "",
      // cliente: cliente?.dni ?? String(dni),
      monto_cancha: Number(r.monto_cancha || 0),
      monto_sena: Number(r.monto_sena || 0),
      fecha: anchorDateObj(r.fechaCopia),
      start: anchorDateObj(r.fechaCopia),
      end: anchorDateObj(r.fechaCopia),
      fechaCopia: anchorDateObj(r.fechaCopia),
    }));

    // armo la metadata de paginación
    const response = {
      ok: true,
      total,
      reservas,
      limite: take,
      desde: skip,
    };
    if (page) {
      response.page = page;
      response.pages = Math.max(1, Math.ceil(total / take));
    }

    return res.json(response);
  } catch (error) {
    console.error("getReservaFechaCancha error:", error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================TRAIGO_POR_CLIENTE_RANGO_CANCHA====================================
async function getReservaClienteRango(req, res) {
  try {
    const { cliente: dni, fechaIni, fechaFin } = req.params;

    if (!dni)
      return res
        .status(400)
        .json({ ok: false, msg: "Debe indicar el cliente" });
    if (!fechaIni || !fechaFin) {
      return res
        .status(400)
        .json({ ok: false, msg: "Debe indicar fechaIni y fechaFin" });
    }

    const ini = new Date(`${fechaIni}T00:00:00Z`);
    const fin = new Date(`${fechaFin}T00:00:00Z`);

    if (isNaN(ini) || isNaN(fin) || ini > fin) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    //dni ya no es único -> usar findFirst + solo ACTIVO
    const cliente = await prisma.cliente.findFirst({
      where: { dni: String(dni).trim(), estado: "activo" },
      select: { id: true },
    });
    if (!cliente)
      return res
        .status(404)
        .json({ ok: false, msg: "Cliente no encontrado (activo)" });

    // paginación
    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit));

    const where = {
      clienteId: cliente.id,
      estado: "activo",
      fechaCopia: { gte: ini, lte: fin },
    };

    const [total, rows] = await Promise.all([
      prisma.reserva.count({ where }),
      prisma.reserva.findMany({
        where,
        orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
        skip,
        take,
        include: {
          cancha: { select: { nombre: true } },
          cliente: { select: { dni: true, nombre: true, apellido: true } },
        },
      }),
    ]);

    const reservas = rows.map(({ cancha, cliente: cli, ...r }) => ({
      ...r,
      cancha: cancha?.nombre ?? "",
      cliente: cliente?.dni ?? String(dni),
      monto_cancha: Number(r.monto_cancha || 0),
      monto_sena: Number(r.monto_sena || 0),
      fecha: anchorDateObj(r.fechaCopia),
      start: anchorDateObj(r.fechaCopia),
      end: anchorDateObj(r.fechaCopia),
      fechaCopia: anchorDateObj(r.fechaCopia),
    }));

    const resp = {
      ok: true,
      total,
      reservas,
      limite: take,
      desde: skip,
    };
    if (page) {
      resp.page = page;
      resp.pages = Math.max(1, Math.ceil(total / take));
    }
    return res.json(resp);
  } catch (err) {
    console.error("getReservaClienteRango error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================RANGO_FECHAS->POR_ESTADO_PAGO====================================
async function estadoReservasRango(req, res) {
  try {
    const { estado_pago, fechaIni, fechaFin } = req.params;

    // 0) Validaciones
    const ESTADOS = new Set(["TOTAL", "SEÑA", "IMPAGO"]);
    if (!ESTADOS.has(String(estado_pago).toUpperCase())) {
      return res.status(400).json({ ok: false, msg: "estado_pago inválido" });
    }
    const sIni = String(fechaIni).trim();
    const sFin = String(fechaFin).trim();
    const YMD = /^\d{4}-\d{2}-\d{2}$/;

    /**
         * este codigo es para evitar fechas invalidas, ejemplo que vengan con espacios 
          las limpia y formatea
        */
    if (!YMD.test(sIni) || !YMD.test(sFin)) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // Parte las fechas y convierte cada pedazo a número
    const [y1, m1, d1] = sIni.split("-").map(Number);
    const [y2, m2, d2] = sFin.split("-").map(Number);

    // Crea objetos Date en UTC, a las 00:00:00 de cada día --->2025-09-01T00:00:00.000Z
    // UTC evita problemas de huso horario (no te corre el día).
    const ini = new Date(Date.UTC(y1, m1 - 1, d1));
    const fin = new Date(Date.UTC(y2, m2 - 1, d2));

    if (isNaN(ini) || isNaN(fin) || ini > fin) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // 1) Paginación
    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit));

    // 2) Filtro: estado activo, estado_pago, rango de días
    const where = {
      estado: "activo",
      estado_pago: String(estado_pago).toUpperCase(),
      fechaCopia: { gte: ini, lte: fin },
    };

    const total = await prisma.reserva.count({ where });

    const rows = await prisma.reserva.findMany({
      where,
      orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
      skip,
      take,
    });

    // 3) Respuesta amigable para el front (montos a number y fechas ancladas 03:00Z)
    const reservas = rows.map((r) => ({
      ...r,
      monto_cancha: Number(r.monto_cancha || 0),
      monto_sena: Number(r.monto_sena || 0),
      fecha: anchorDateObj(r.fechaCopia),
      start: anchorDateObj(r.fechaCopia),
      end: anchorDateObj(r.fechaCopia),
      fechaCopia: anchorDateObj(r.fechaCopia),
    }));

    const resp = { ok: true, total, reservas, limite: take, desde: skip };
    if (page) {
      resp.page = page;
      resp.pages = Math.max(1, Math.ceil(total / take));
    }

    return res.json(resp);
  } catch (err) {
    console.error("estadoReservasRango error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================RECAUDACION-->RANGO_FECHA_CANCHA====================================
async function estadoRecaudacion(req, res) {
  try {
    const { cancha, fechaIni, fechaFin } = req.params;

    // 0) Validaciones de fechas (trim + formato YYYY-MM-DD + construir UTC 00:00)
    const sIni = String(fechaIni).trim();
    const sFin = String(fechaFin).trim();
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    if (!YMD.test(sIni) || !YMD.test(sFin)) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }
    const [y1, m1, d1] = sIni.split("-").map(Number);
    const [y2, m2, d2] = sFin.split("-").map(Number);

    const ini = new Date(Date.UTC(y1, m1 - 1, d1)); // 00:00Z
    const fin = new Date(Date.UTC(y2, m2 - 1, d2)); // 00:00Z

    if (isNaN(ini) || isNaN(fin) || ini > fin) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // 1) Cancha por NOMBRE
    const canchaRow = await prisma.cancha.findUnique({
      where: { nombre: cancha },
    });
    if (!canchaRow) {
      return res.status(400).json({ ok: false, msg: "No existe cancha" });
    }

    // 2) Paginación (estilo Mongo: ?desde & ?limite) + soporte page/limit
    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit)); // tope sano

    // 2.5) Traigo la configuración (para conocer el precio base de la cancha)
    const conf = await prisma.configuracion.findUnique({
      where: { canchaId: canchaRow.id },
    });
    const precioBase = Number(conf?.monto_cancha || 0);

    // 3) Filtro base: SOLO activas + día dentro del rango + cancha
    const where = {
      estado: "activo",
      canchaId: canchaRow.id,
      fechaCopia: { gte: ini, lte: fin },
    };

    // 4) Totales GLOBALes del rango (no de la página)
    const [{ _sum }, total] = await Promise.all([
      //-->calcula la suma total de monto_cancha y monto_sena para todo lo que cumple where
      prisma.reserva.aggregate({
        where,
        _sum: { monto_cancha: true, monto_sena: true },
      }),
      prisma.reserva.count({ where }),
    ]);

    const totalMontoCancha = Number(_sum.monto_cancha || 0);
    const totalMontoSena = Number(_sum.monto_sena || 0);
    // const totalCobrado     = totalMontoCancha + totalMontoSena;

    // Deuda global = suma por reserva aplicando la regla TOTAL/SEÑA/IMPAGO
    const allRowsForDebt = await prisma.reserva.findMany({
      where,
      select: { estado_pago: true, monto_sena: true }, // sólo lo que necesito
    });
    const totalDeuda = allRowsForDebt.reduce((acc, r) => {
      if (r.estado_pago === "TOTAL") return acc + 0;
      if (r.estado_pago === "SEÑA")
        return acc + Math.max(0, precioBase - Number(r.monto_sena || 0));
      // IMPAGO u otros
      return acc + precioBase;
    }, 0);

    // 5) Página de resultados (orden estable: día -> hora -> id)
    const rows = await prisma.reserva.findMany({
      where,
      orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
      skip,
      take,
    });

    // 6) Formato de salida (montos a Number, fechas ancladas a 03:00Z)
    const reservas = rows.map((r) => {
      const consolidado = Number(r.monto_cancha || 0);
      const senia = Number(r.monto_sena || 0);
      let deuda = 0;
      if (r.estado_pago === "SEÑA") deuda = Math.max(0, precioBase - senia);
      else if (r.estado_pago === "IMPAGO") deuda = precioBase;

      return {
        ...r,
        monto_cancha: consolidado,
        monto_sena: senia,
        monto_deuda: deuda,

        fecha: anchorDateObj(r.fechaCopia),
        start: anchorDateObj(r.fechaCopia),
        end: anchorDateObj(r.fechaCopia),
        fechaCopia: anchorDateObj(r.fechaCopia),
      };
    });

    // 6.5) Resumen DIARIO
    const byDay = new Map(); // clave: 'YYYY-MM-DD' (de r.fechaCopia en UTC)
    for (const r of reservas) {
      const key = new Date(r.fechaCopia).toISOString().slice(0, 10); // YYYY-MM-DD
      const acc = byDay.get(key) || {
        fecha: anchorDateObj(new Date(key + "T00:00:00Z")),
        cancha: canchaRow.nombre,
        total_consolidado: 0,
        total_senas: 0,
        total_deuda: 0,
      };
      acc.total_consolidado += r.monto_cancha;
      acc.total_senas += r.monto_sena;
      acc.total_deuda += r.monto_deuda;
      byDay.set(key, acc);
    }
    const resumenDiario = Array.from(byDay.values()).sort(
      (a, b) => a.fecha - b.fecha
    ); // orden por día asc

    // 7) Respuesta final
    const resp = {
      ok: true,
      total, // cantidad de reservas activas en el rango/cancha
      reservas, // página actual con monto_deuda
      limite: take,
      desde: skip,
      totales: {
        // totales GLOBALes del rango
        cancha: canchaRow.nombre,
        fechaIni: sIni,
        fechaFin: sFin,
        monto_cancha: totalMontoCancha,
        monto_sena: totalMontoSena,
        monto_deuda: totalDeuda,
        total: totalMontoCancha + totalMontoSena, // lo efectivamente cobrado
      },
      resumenDiario, // filas para la tabla: fecha, cancha, total_consolidado, total_senas, total_deuda
    };
    if (page) {
      resp.page = page;
      resp.pages = Math.max(1, Math.ceil(total / take));
    }

    return res.json(resp);
  } catch (err) {
    console.error("estadoRecaudacionRango error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================RECAUDACIONFORMASDEPAGO====================================
async function recaudacionFormasDePago(req, res) {
  try {
    const { fecha, cancha } = req.params;

    // normalizo fecha (YYYY-MM-DD) -> 00:00Z
    const sFecha = String(fecha).trim();
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    if (!YMD.test(sFecha)) {
      return res
        .status(400)
        .json({ ok: false, msg: "Fecha inválida (YYYY-MM-DD)" });
    }
    const [y, m, d] = sFecha.split("-").map(Number);
    const dayUTC = new Date(Date.UTC(y, m - 1, d));

    // cancha por nombre
    const canchaRow = await prisma.cancha.findUnique({
      where: { nombre: cancha },
    });
    if (!canchaRow)
      return res.status(400).json({ ok: false, msg: "No existe cancha" });

    // normalizo forma_pago y estado_pago (permito "SENA" -> "SEÑA", y "TODAS") //------------------> dudas
    const norm = (s = "") => String(s).trim().toUpperCase();
    let forma = norm(req.params.forma_pago || "TODAS");
    let estadoPago = norm(req.params.estado_pago || "TODAS");
    if (forma === "SENA") forma = "SEÑA";

    // paginación
    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit));

    // filtro base: solo activas, día exacto, cancha
    const whereBase = {
      estado: "activo",
      canchaId: canchaRow.id,
      fechaCopia: dayUTC,
    };

    // agrego forma_pago si no es TODAS//--------------------------------------------------------------->dudas
    const withForma =
      forma && forma !== "TODAS"
        ? { ...whereBase, forma_pago: forma }
        : whereBase;

    // agrego estado_pago si no es TODAS
    const where =
      estadoPago && estadoPago !== "TODAS"
        ? { ...withForma, estado_pago: estadoPago }
        : withForma;

    // precio base de la cancha (para deuda SEÑA/IMPAGO)
    const conf = await prisma.configuracion.findUnique({
      where: { canchaId: canchaRow.id },
    });
    const precioBase = Number(conf?.monto_cancha || 0);

    // totales globales del día/cancha/filtros
    const [{ _sum }, total] = await Promise.all([
      //--------------------------------------------------------------->dudas
      prisma.reserva.aggregate({
        where,
        _sum: { monto_cancha: true, monto_sena: true },
      }),
      prisma.reserva.count({ where }),
    ]);
    const totalMontoCancha = Number(_sum.monto_cancha || 0);
    const totalMontoSena = Number(_sum.monto_sena || 0);

    // deuda global (por estado_pago de cada fila)
    const rowsForDebt = await prisma.reserva.findMany({
      where,
      select: { estado_pago: true, monto_sena: true },
    });
    const totalDeuda = rowsForDebt.reduce((acc, r) => {
      if (r.estado_pago === "TOTAL") return acc;
      if (r.estado_pago === "SEÑA")
        return acc + Math.max(0, precioBase - Number(r.monto_sena || 0));
      return acc + precioBase; // IMPAGO
    }, 0);

    // página de resultados (incluye estado_pago)
    const rows = await prisma.reserva.findMany({
      where,
      orderBy: [{ hora: "asc" }, { id: "asc" }],
      skip,
      take,
    });

    // salida: montos numéricos, fechas 03:00Z, deuda por fila, y estado_pago presente
    const reservas = rows.map((r) => {
      const consolidado = Number(r.monto_cancha || 0);
      const senia = Number(r.monto_sena || 0);
      let deuda = 0;
      if (r.estado_pago === "SEÑA") deuda = Math.max(0, precioBase - senia);
      else if (r.estado_pago === "IMPAGO") deuda = precioBase;

      return {
        ...r, // incluye r.estado_pago
        monto_cancha: consolidado,
        monto_sena: senia,
        monto_deuda: deuda,
        fecha: anchorDateObj(r.fechaCopia),
        start: anchorDateObj(r.fechaCopia),
        end: anchorDateObj(r.fechaCopia),
        fechaCopia: anchorDateObj(r.fechaCopia),
      };
    });

    const resp = {
      ok: true,
      total,
      reservas,
      limite: take,
      desde: skip,
      filtro: {
        fecha: sFecha,
        cancha: canchaRow.nombre,
        forma_pago: forma && forma !== "TODAS" ? forma : "TODAS",
        estado_pago:
          estadoPago && estadoPago !== "TODAS" ? estadoPago : "TODAS",
      },
      totales: {
        monto_cancha: totalMontoCancha,
        monto_sena: totalMontoSena,
        monto_deuda: totalDeuda,
        total: totalMontoCancha + totalMontoSena,
      },
    };

    if (page) {
      resp.page = page;
      resp.pages = Math.max(1, Math.ceil(total / take));
    }
    return res.json(resp);
  } catch (err) {
    console.error("recaudacionFormasDePago error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================RESERVAS_ELIMINADAS====================================
async function reservasEliminadasRango(req, res) {
  try {
    const { estado_pago, fechaIni, fechaFin } = req.params;

    // 1) normalizo y valido fechas YYYY-MM-DD (rango inclusivo)
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    const sIni = String(fechaIni).trim();
    const sFin = String(fechaFin).trim();
    if (!YMD.test(sIni) || !YMD.test(sFin)) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }
    const [y1, m1, d1] = sIni.split("-").map(Number);
    const [y2, m2, d2] = sFin.split("-").map(Number);
    const ini = new Date(Date.UTC(y1, m1 - 1, d1)); // 00:00Z
    const fin = new Date(Date.UTC(y2, m2 - 1, d2)); // 00:00Z
    if (isNaN(ini) || isNaN(fin) || ini > fin) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // 2) paginación (soporta ?page&limit y ?desde&limite)
    const q = req.query || {};
    const limit = Number(q.limit ?? q.limite ?? 10);
    const pageQ = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = pageQ ? (pageQ - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const page = pageQ ?? Math.floor(skip / limit) + 1;

    // 3) filtro base: inactivas + rango por día
    const where = {
      estado: "inactivo",
      fechaCopia: { gte: ini, lte: fin },
    };

    // 3.1) filtro por estado_pago (TODAS no filtra). Acepto SENA -> SEÑA
    let estado = String(estado_pago || "TODAS")
      .trim()
      .toUpperCase();
    if (estado === "SENA") estado = "SEÑA";
    if (estado !== "TODAS") where.estado_pago = estado;

    // 4) total y página de resultados (orden estable)
    const [totalItems, rows] = await Promise.all([
      prisma.reserva.count({ where }),
      prisma.reserva.findMany({
        where,
        orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    if (totalItems === 0) {
      return res.status(404).json({
        ok: false,
        msg: "No se encontraron reservas en el rango de fechas especificado",
        reservasFormateadas: [],
        totalPages: 1,
      });
    }

    // 5) salida igual a Mongo: base + campos según estado_pago
    const reservasFormateadas = rows.map((r) => {
      const base = {
        nombre: r.nombreCliente,
        apellido: r.apellidoCliente,
        fecha: anchorDateObj(r.fechaCopia), // T03:00:00.000Z para compat
        cancha: r.title, // nombre de la cancha
        hora: r.hora,
        estadoPago: r.estado_pago,
        estado: r.estado,
        usuario: r.user,
      };
      const monto_total = Number(r.monto_cancha || 0);
      const monto_sena = Number(r.monto_sena || 0);

      switch (estado) {
        case "TOTAL":
          return { ...base, monto_total };
        case "SEÑA":
          return { ...base, monto_sena };
        case "IMPAGO":
          return base;
        default: // TODAS
          return { ...base, monto_total, monto_sena };
      }
    });

    return res.status(200).json({
      ok: true,
      reservasFormateadas,
      page,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      totalItems,
      msg: "Estado de las reservas eliminadas",
    });
  } catch (err) {
    console.error("reservasEliminadasRango error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

module.exports = {
  crearReserva,
  actualizarReserva,
  eliminarReserva,
  obtenerMontoPorEstado,
  obtenerHorasDisponibles,
  //.......consultas.............
  getReservaFechaCancha, //-->ver de implementar limpieza de datos sucios como hice en estadoReservasRango
  getReservaClienteRango, //-->ver de implementar limpieza de datos sucios como hice en estadoReservasRango
  estadoReservasRango,
  estadoRecaudacion,
  recaudacionFormasDePago,
  reservasEliminadasRango,
};
