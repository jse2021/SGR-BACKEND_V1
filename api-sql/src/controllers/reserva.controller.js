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

// Convierte "25.000", "25,000", "25.000,50" -> número JS válido
function parseMonto(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;

  // Trim y normalización simple AR/ES:
  // - quita separadores de miles "."
  // - convierte coma decimal a punto
  const normalized = value
    .trim()
    .replace(/\./g, "") // "25.000" -> "25000"
    .replace(/,/g, "."); // "25000,50" -> "25000.50"

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
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


// ============================================== CREAR RESERVA (Con soporte para Turnos Fijos) ==========
async function crearReserva(req, res) {
  try {
    // 1) Body del front
    const {
      cliente: clienteRequest,
      cancha: canchaRequest,
      estado_pago: estadoPagoRequest,
      fecha: fechaRequest,
      fechaCopia: fechaCopiaRequest,
      hora: horaRequest,
      forma_pago,
      pagos, // Arreglo de pagos divididos
      observacion,
      title,
      start,
      end,
      // NUEVO: Parámetros para Turno Fijo / Recurrente
      frecuencia = "NINGUNA",
      fechaFin: fechaFinRequest,
    } = req.body;

    const uid = req.uid ?? req.id ?? null;

    // 2) Validaciones base
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
        .json({ ok: false, msg: "El horario no puede estar vacío" });
    if (!estadoPagoRequest)
      return res
        .status(400)
        .json({ ok: false, msg: "Debe seleccionar un estado de pago" });

    // 3) Resolver cancha y cliente (SOLO ACTIVOS)
    const nombreCancha = String(canchaRequest || "").trim();
    const dniCliente = String(clienteRequest || "").trim();

    const [clienteRow, canchaRow] = await Promise.all([
      prisma.cliente.findFirst({
        where: { estado: "activo", dni: dniCliente },
        select: { id: true, nombre: true, apellido: true, email: true, esExpress: true }, // <--- AGREGADO
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

    // 4) Configuración de precios de la cancha
    const conf = await prisma.configuracion.findUnique({
      where: { canchaId: canchaRow.id },
      select: { monto_cancha: true, monto_sena: true },
    });

    if (!conf) {
      return res.status(400).json({
        ok: false,
        msg: "La cancha no tiene configuración de precios",
      });
    }

    let importeFinal = 0;
    if (estadoPagoRequest === "TOTAL") {
      importeFinal = Number(conf.monto_cancha || 0);
    } else if (estadoPagoRequest === "SEÑA") {
      importeFinal = Number(conf.monto_sena || 0);
    }

    const monto_cancha = estadoPagoRequest === "TOTAL" ? importeFinal : 0;
    const monto_sena = estadoPagoRequest === "SEÑA" ? importeFinal : 0;

    // 5) Adaptador para Pagos Divididos
    let listaPagos = [];
    if (pagos && Array.isArray(pagos) && pagos.length > 0) {
      listaPagos = pagos;
    } else if (forma_pago && importeFinal > 0) {
      listaPagos = [{ forma_pago: forma_pago, monto: importeFinal }];
    }

    if (listaPagos.length > 0) {
      const sumaPagos = listaPagos.reduce((acc, p) => acc + Number(p.monto), 0);
      if (sumaPagos !== importeFinal) {
        return res.status(400).json({
          ok: false,
          msg: "La suma de los pagos divididos no coincide con el importe total a cobrar.",
        });
      }
    }

    // 6) Normalización de Fecha Inicio y Hora
    const fechaInicioUTC = dateOnlyUTC(fechaRequest || fechaCopiaRequest);
    const horaStr = String(horaRequest || "00:00").padStart(5, "0");

// 7) Generación de lista de fechas según la Frecuencia
    const esRecurrente =
      frecuencia &&
      frecuencia.toUpperCase() !== "NINGUNA" &&
      fechaFinRequest;

    // NUEVO: Bloqueo de turnos fijos para clientes express (AHORA EN EL LUGAR CORRECTO)
    if (clienteRow.esExpress && esRecurrente) {
      return res.status(400).json({ 
        ok: false, 
        msg: "Por seguridad operativa, no se pueden crear turnos fijos para clientes invitados. Por favor, registre al cliente formalmente." 
      });
    }

    const fechasASeparar = [fechaInicioUTC];

    if (esRecurrente) {
      const fechaFinUTC = dateOnlyUTC(fechaFinRequest);
      let fechaCursor = new Date(fechaInicioUTC);

      // Limite de seguridad de repeticiones (máx 52 semanas / 1 año)
      let iteraciones = 0;
      while (iteraciones < 52) {
        iteraciones++;
        if (frecuencia.toUpperCase() === "SEMANAL") {
          fechaCursor.setUTCDate(fechaCursor.getUTCDate() + 7);
        } else if (frecuencia.toUpperCase() === "QUINCENAL") {
          fechaCursor.setUTCDate(fechaCursor.getUTCDate() + 14);
        } else if (frecuencia.toUpperCase() === "MENSUAL") {
          fechaCursor.setUTCMonth(fechaCursor.getUTCMonth() + 1);
        } else {
          break;
        }

        if (fechaCursor > fechaFinUTC) break;
        fechasASeparar.push(new Date(fechaCursor));
      }
    }

    // 8) Chequeo de colisión previo en TODAS las fechas de la serie
    const ocupadas = await prisma.reserva.findMany({
      where: {
        canchaId: canchaRow.id,
        fechaCopia: { in: fechasASeparar },
        hora: horaStr,
        estado: "activo",
      },
      select: { fechaCopia: true },
    });

    if (ocupadas.length > 0) {
      const fechasOcupadasStr = ocupadas
        .map((o) => anchorDateObj(o.fechaCopia).toLocaleDateString("es-AR"))
        .join(", ");
      return res.status(409).json({
        ok: false,
        msg: `No se pudo crear el Turno Fijo. Horario ocupado en las siguientes fechas: ${fechasOcupadasStr}`,
      });
    }

    // 9) Generar ID de Turno Fijo si aplica
    const turnoFijoId = esRecurrente
      ? `tf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      : null;

    // 10) Usuario ejecutor
    const usuario = uid
      ? await prisma.usuario.findUnique({ where: { id: Number(uid) } })
      : null;

 // 11) Transacción de Creación Masiva (Con timeout ampliado para turnos largos)
    let reservasCreadas = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < fechasASeparar.length; i++) {
        const fUTC = fechasASeparar[i];
        const esPrimeraFecha = i === 0;

        const ePago = esPrimeraFecha ? estadoPagoRequest : "IMPAGO";
        const fPago = esPrimeraFecha
          ? (listaPagos.map((p) => p.forma_pago).join(" + ") || forma_pago || "")
          : "IMPAGO";
        const mCancha = esPrimeraFecha ? monto_cancha : 0;
        const mSena = esPrimeraFecha ? monto_sena : 0;
        const pagosACrear = esPrimeraFecha ? listaPagos : [];

        const creada = await tx.reserva.create({
          data: {
            clienteId: clienteRow.id,
            canchaId: canchaRow.id,
            usuarioId: usuario?.id ?? null,
            user: usuario?.user ?? null,

            estado_pago: ePago,
            forma_pago: fPago,
            estado: "activo",

            turnoFijoId: turnoFijoId,
            frecuencia: esRecurrente ? frecuencia.toUpperCase() : "NINGUNA",

            monto_cancha: mCancha,
            monto_sena: mSena,

            fecha: anchorDateObj(fUTC),
            fechaCopia: fUTC,
            hora: horaStr,

            title: title ?? canchaRequest,
            start: anchorDateObj(fUTC),
            end: anchorDateObj(fUTC),

            nombreCliente: clienteRow.nombre,
            apellidoCliente: clienteRow.apellido,
            observacion: observacion ?? null,

            pagos: {
              create: pagosACrear.map((p) => ({
                forma_pago: p.forma_pago,
                monto: p.monto,
                usuarioId: usuario?.id ?? null,
              })),
            },
          },
          include: { pagos: true },
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

            turnoFijoId: creada.turnoFijoId,
            frecuencia: creada.frecuencia,

            pagos_snapshot: pagosACrear,

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

        reservasCreadas.push(creada);
      }
    }, { 
      timeout: 15000 // <--- Aumenta el tiempo límite de la transacción a 15 segundos
    });

   

    // 12) Envío de email para la primera fecha
    try {
      if (typeof enviarCorreoReserva === "function" && clienteRow.email) {
        const primera = reservasCreadas[0];
        const fechaFormateada = anchorDateObj(
          primera.fechaCopia
        ).toLocaleDateString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        });

        const msjObs = esRecurrente
          ? `${
              primera.observacion || ""
            } (Turno Fijo ${frecuencia.toUpperCase()} - ${
              reservasCreadas.length
            } fechas reservadas)`.trim()
          : primera.observacion || "";

        await enviarCorreoReserva(clienteRow.email, {
          cancha: canchaRequest,
          fecha: fechaFormateada,
          hora: primera.hora,
          nombre: `${primera.nombreCliente} ${primera.apellidoCliente}`,
          estado: primera.estado_pago,
          observacion: msjObs,
        });
      }
    } catch (e) {
      console.warn("Email de reserva falló:", e?.message);
    }

    // 13) Formateo de respuesta
    const primeraCreada = reservasCreadas[0];
    const reservaOut = {
      ...primeraCreada,
      monto_cancha: Number(primeraCreada.monto_cancha || 0),
      monto_sena: Number(primeraCreada.monto_sena || 0),
      monto:
        primeraCreada.estado_pago === "TOTAL"
          ? Number(primeraCreada.monto_cancha || 0)
          : primeraCreada.estado_pago === "SEÑA"
          ? Number(primeraCreada.monto_sena || 0)
          : 0,
      fecha: anchorDateObj(primeraCreada.fechaCopia),
      start: anchorDateObj(primeraCreada.fechaCopia),
      end: anchorDateObj(primeraCreada.fechaCopia),
      fechaCopia: anchorDateObj(primeraCreada.fechaCopia),
      pagos: primeraCreada.pagos
        ? primeraCreada.pagos.map((p) => ({ ...p, monto: Number(p.monto || 0) }))
        : [],
    };

    return res.status(201).json({
      ok: true,
      msg: esRecurrente
        ? `Turno Fijo registrado exitosamente (${reservasCreadas.length} reservas creadas)`
        : "Reserva registrada exitosamente",
      reserva: reservaOut,
      totalReservasCreadas: reservasCreadas.length,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        ok: false,
        msg: "Turno ocupado para esa cancha, fecha y hora",
      });
    }
    console.error("Error en crearReserva:", error);
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
      return res
        .status(400)
        .json({ ok: false, msg: "Faltan datos: fecha y/o cancha" });
    }

    // Día puro UTC (00:00Z) como guardás en SQL
    const fechaDia = dateOnlyUTC(fecha); // ya lo tenés declarado arriba :contentReference[oaicite:0]{index=0}

    // Resolver cancha ACTIVA por NOMBRE (case-insensitive)
    const canchaRow = await prisma.cancha.findFirst({
      where: {
        estado: "activo",
        nombre: { equals: String(cancha).trim(), mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!canchaRow) {
      return res
        .status(404)
        .json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    const where = {
      fechaCopia: fechaDia,
      canchaId: canchaRow.id,
      OR: [{ estado: "activo" }, { estado: { equals: "" } }],
    };

    // Excluir mi propia reserva cuando edito
    const idNum = Number(reservaId);
    if (Number.isFinite(idNum) && idNum > 0) where.NOT = { id: idNum };

    // Traer horas ocupadas ordenadas
    const reservasRegistradas = await prisma.reserva.findMany({
      where,
      select: { hora: true },
      orderBy: { hora: "asc" },
    });

    const horasOcupadas = reservasRegistradas.map((r) =>
      String(r.hora).padStart(5, "0")
    );

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
    return res.status(200).json({ ok: true, horasDisponibles });
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

    // 6) Si cambian cancha u estado_pago -> recalcular montos (SIEMPRE desde configuracion)
    let estadoPago = nueva.estado_pago ?? actual.estado_pago;
    let monto_cancha = actual.monto_cancha;
    let monto_sena = actual.monto_sena;

    if (nueva.estado_pago || nueva.cancha) {
      // Resolver configuración actual de la cancha destino
      const conf = await prisma.configuracion.findUnique({
        where: { canchaId: destCancha.id },
        select: { monto_cancha: true, monto_sena: true },
      });

      const precioTotal = Number(conf?.monto_cancha || 0);
      const precioSena = Number(conf?.monto_sena || 0);

if (estadoPago === "TOTAL") {
        monto_cancha = precioTotal;
        monto_sena = 0;
      } else if (estadoPago === "SEÑA") {
        monto_sena = precioSena;
        monto_cancha = 0;
      } else {
        monto_cancha = 0;
        monto_sena = 0;
      }
    }

    // --- NUEVO: ADAPTADOR Y VALIDACIÓN PARA PAGOS AL ACTUALIZAR ---
    let listaPagos = [];
    if (nueva.pagos && Array.isArray(nueva.pagos) && nueva.pagos.length > 0) {
      listaPagos = nueva.pagos;
    } else if (nueva.forma_pago && (monto_cancha > 0 || monto_sena > 0)) {
      listaPagos = [{ forma_pago: nueva.forma_pago, monto: monto_cancha > 0 ? monto_cancha : monto_sena }];
    }

    const importeEsperado = estadoPago === "TOTAL" ? monto_cancha : (estadoPago === "SEÑA" ? monto_sena : 0);
    
    if (estadoPago !== "IMPAGO" && listaPagos.length > 0) {
      const sumaPagos = listaPagos.reduce((acc, p) => acc + Number(p.monto), 0);
      if (sumaPagos !== importeEsperado) {
        return res.status(400).json({ ok: false, msg: "La suma de los pagos no coincide con el importe total esperado." });
      }
    }
    // -------------------------------------------------------------

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

// 10.1) Actualizamos la reserva reconstruyendo sus pagos
      updated = await tx.reserva.update({
        where: { id: actual.id },
        data: {
          ...dataUpdate,
          forma_pago: listaPagos.map(p => p.forma_pago).join(" + ") || nueva.forma_pago || actual.forma_pago,
          pagos: {
            deleteMany: {}, // <-- Borra los tickets anteriores de esta reserva
            create: listaPagos.map(p => ({ // <-- Crea los nuevos tickets
              forma_pago: p.forma_pago,
              monto: p.monto,
              usuarioId: usuario?.id ?? null
            }))
          }
        },
        include: { pagos: true }, // <--- ¡AQUÍ ESTÁ LA MAGIA!
      });

      // 10.2) Guardamos el historial con la foto de los nuevos pagos
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
          
          pagos_snapshot: listaPagos, // <-- NUEVO: Historial en JSON

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
      monto:
        updated.estado_pago === "TOTAL"
          ? Number(updated.monto_cancha || 0)
          : updated.estado_pago === "SEÑA"
          ? Number(updated.monto_sena || 0)
          : 0,
      fecha: anchorDateObj(updated.fechaCopia),
      start: anchorDateObj(updated.fechaCopia),
      end: anchorDateObj(updated.fechaCopia),
      fechaCopia: anchorDateObj(updated.fechaCopia),
      
      // NUEVO: Devolvemos los pagos al frontend para que Redux no los pierda
      pagos: updated.pagos ? updated.pagos.map(p => ({ ...p, monto: Number(p.monto || 0) })) : [],
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
    const reserva = await prisma.reserva.findUnique({ 
      where: { id }, 
      include: { pagos: true } // <--- NUEVO: Leemos los pagos antes de cancelar
    });
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
          // NUEVO: Guardamos la foto de los pagos al momento de cancelar
          pagos_snapshot: reserva.pagos,
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
        cliente: { select: { dni: true, nombre: true, apellido: true }, },
        pagos: true, // <--- NUEVO: Le pedimos a Prisma que traiga los tickets de pago
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
      // NUEVO: Formateamos los pagos y los adjuntamos a la reserva
      pagos: r.pagos ? r.pagos.map(p => ({
        ...p,
        monto: Number(p.monto || 0)
      })) : []
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
          pagos: true, // <--- NUEVO: Le pedimos a Prisma que traiga los tickets
        },
      }),
    ]);

    const reservas = rows.map(({ cancha, cliente: cli, pagos, ...r }) => ({
      ...r,
      cancha: cancha?.nombre ?? "",
      cliente: cliente?.dni ?? String(dni),
      monto_cancha: Number(r.monto_cancha || 0),
      monto_sena: Number(r.monto_sena || 0),
      fecha: anchorDateObj(r.fechaCopia),
      start: anchorDateObj(r.fechaCopia),
      end: anchorDateObj(r.fechaCopia),
      fechaCopia: anchorDateObj(r.fechaCopia),
      // NUEVO: Formateamos los pagos y los adjuntamos a la reserva
      pagos: pagos ? pagos.map(p => ({
        ...p,
        monto: Number(p.monto || 0)
      })) : []
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
// Reporte: estado de pago en rango de fechas (TOTAL | SEÑA | IMPAGO)
async function estadoReservasRango(req, res) {
  try {
    const { estado_pago, fechaIni, fechaFin } = req.params;

    // 0) Validaciones básicas
    const ESTADOS = new Set(["TOTAL", "SEÑA", "IMPAGO"]);
    const estadoSel = String(estado_pago || "")
      .toUpperCase()
      .trim();
    if (!ESTADOS.has(estadoSel)) {
      return res.status(400).json({ ok: false, msg: "estado_pago inválido" });
    }

    const sIni = String(fechaIni || "").trim();
    const sFin = String(fechaFin || "").trim();
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    if (!YMD.test(sIni) || !YMD.test(sFin)) {
      return res
        .status(400)
        .json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // Fechas a 00:00 UTC (evita corrimientos)
    const [y1, m1, d1] = sIni.split("-").map(Number);
    const [y2, m2, d2] = sFin.split("-").map(Number);
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

    // 2) Filtro principal
    const where = {
      estado: "activo",
      estado_pago: estadoSel,
      fechaCopia: { gte: ini, lte: fin },
    };

    // 3) Totales + página de resultados
    const [total, rows] = await Promise.all([
      prisma.reserva.count({ where }),
      prisma.reserva.findMany({
        where,
        orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
        skip,
        take,
        include: {
          cancha: { select: { id: true, nombre: true } },
          cliente: { select: { nombre: true, apellido: true, dni: true } },
          usuario: { select: { user: true } },
        },
      }),
    ]);

    // 4) Precio base por cancha (para IMPAGO y para deuda de SEÑA cuando corresponda)
    //    Pre-cargamos la última configuración por canchaId presente en la página.
    const canchaIds = Array.from(
      new Set(rows.map((r) => r.canchaId).filter(Boolean))
    );
    let confMap = new Map();
    if (canchaIds.length > 0) {
      // Traigo la última conf de cada canchaId (createdAt desc)
      const confs = await Promise.all(
        canchaIds.map(async (cid) => {
          const c = await prisma.configuracion.findFirst({
            where: { canchaId: cid },
            orderBy: { createdAt: "desc" },
            select: { canchaId: true, monto_cancha: true },
          });
          return c
            ? { canchaId: c.canchaId, precioBase: Number(c.monto_cancha || 0) }
            : null;
        })
      );
      confs.filter(Boolean).forEach(({ canchaId, precioBase }) => {
        confMap.set(Number(canchaId), precioBase);
      });
    }

    // 5) Formateo final para el front
    const reservas = rows.map((r) => {
      const consolidado = Number(r.monto_cancha || 0);
      const senia = Number(r.monto_sena || 0);
      const precioBase = confMap.get(Number(r.canchaId)) || 0;

      // "monto a mostrar" según el estado seleccionado
      let montoMostrar = 0;
      if (estadoSel === "TOTAL") montoMostrar = consolidado;
      else if (estadoSel === "SEÑA") montoMostrar = senia;
      else if (estadoSel === "IMPAGO") montoMostrar = precioBase;

      return {
        // campos originales + relaciones (ya traen nombres)
        ...r,
        // montos normalizados
        monto_cancha: consolidado,
        monto_sena: senia,
        // helpers de UI compatibles
        fecha: anchorDateObj(r.fechaCopia),
        start: anchorDateObj(r.fechaCopia),
        end: anchorDateObj(r.fechaCopia),
        fechaCopia: anchorDateObj(r.fechaCopia),

        // campos "planos" cómodos para la tabla (evita navegar objetos en el front)
        canchaNombre: r.cancha?.nombre ?? "",
        clienteNombre: r.cliente?.nombre ?? "",
        clienteApellido: r.cliente?.apellido ?? "",
        clienteDni: r.cliente?.dni ?? "",

        // este valor te sirve para columna "Monto" sin condicionales en el front
        monto_mostrar: montoMostrar,
      };
    });

    // 6) Respuesta estándar (alineada con lo que venimos usando)
    const resp = {
      ok: true,
      total,
      reservas, // el front debe leer data.reservas
      limite: take,
      desde: skip,
    };
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
    let { cancha, fechaIni, fechaFin } = req.params;

    // 0) Normalizaciones
    cancha = decodeURIComponent(String(cancha || "")).trim();

    // Fechas: YYYY-MM-DD → 00:00Z (evita corrimientos)
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    const sIni = String(fechaIni || "").trim();
    const sFin = String(fechaFin || "").trim();
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

    // 1) Resolver cancha por NOMBRE (solo ACTIVA, case-insensitive)
    const canchaRow = await prisma.cancha.findFirst({
      where: {
        estado: "activo",
        nombre: { equals: cancha, mode: "insensitive" },
      },
      select: { id: true, nombre: true },
    });
    if (!canchaRow) {
      return res
        .status(404)
        .json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    // 2) Paginación (?page & ?limit o ?desde & ?limite)
    const q = req.query || {};
    const limit = Number(q.limit ?? q.limite ?? 10);
    const pageQ = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = pageQ ? (pageQ - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit));
    const page = pageQ ?? Math.floor(skip / take) + 1;

    // 3) Precio base (última configuración de la cancha)
    const conf = await prisma.configuracion.findFirst({
      where: { canchaId: canchaRow.id },
      orderBy: { createdAt: "desc" },
      select: { monto_cancha: true, monto_sena: true },
    });
    const precioBase = Number(conf?.monto_cancha ?? 0);

    // 4) Filtro base
    const where = {
      estado: "activo",
      canchaId: canchaRow.id,
      fechaCopia: { gte: ini, lte: fin },
    };

    // 5) Totales globales (independientes de la página)
    const [{ _sum }, totalItems] = await Promise.all([
      prisma.reserva.aggregate({
        where,
        _sum: { monto_cancha: true, monto_sena: true },
      }),
      prisma.reserva.count({ where }),
    ]);

    const totalMontoCancha = Number(_sum.monto_cancha || 0);
    const totalMontoSena = Number(_sum.monto_sena || 0);

    // deuda global
    const rowsForDebt = await prisma.reserva.findMany({
      where,
      select: { estado_pago: true, monto_sena: true },
    });
    const totalDeuda = rowsForDebt.reduce((acc, r) => {
      if (r.estado_pago === "TOTAL") return acc;
      if (r.estado_pago === "SEÑA")
        return acc + Math.max(0, precioBase - Number(r.monto_sena || 0));
      return acc + precioBase; // IMPAGO u otros
    }, 0);

    // 6) Página de resultados (orden estable)
    const rows = await prisma.reserva.findMany({
      where,
      orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        fechaCopia: true,
        hora: true,
        estado_pago: true,
        monto_cancha: true,
        monto_sena: true,
      },
    });

    // 7) Formateo base por reserva + deuda por item
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

    // 8) Resumen diario (clave YYYY-MM-DD). Se entrega también como "resultados"
    // con el mismo naming que usa tu Recaudacion.jsx
    const byDay = new Map();
    for (const r of reservas) {
      const key = r.fechaCopia.toISOString().slice(0, 10); // YYYY-MM-DD
      const acc = byDay.get(key) || {
        Fecha: key,
        Cancha: canchaRow.nombre,
        monto_consolidado: 0,
        senas_consolidadas: 0,
        monto_deuda: 0,
        total_reservas: 0,
      };
      acc.monto_consolidado += r.monto_cancha;
      acc.senas_consolidadas += r.monto_sena;
      acc.monto_deuda += r.monto_deuda;
      acc.total_reservas += 1;
      byDay.set(key, acc);
    }

    const resumenDiario = Array.from(byDay.values()).sort(
      (a, b) => new Date(a.Fecha) - new Date(b.Fecha)
    );

    // 9) Respuesta estándar + alias compatibles con tu front
    const resp = {
      ok: true,
      total: totalItems,
      reservas, // detalle por reserva (página actual)
      resumenDiario, // filas por día (ordenadas)
      resultados: resumenDiario, // <--- alias para Recaudacion.jsx
      page,
      pages: Math.max(1, Math.ceil(totalItems / take)),
      limite: take,
      desde: skip,
      totales: {
        cancha: canchaRow.nombre,
        fechaIni: sIni,
        fechaFin: sFin,
        monto_cancha: totalMontoCancha,
        monto_sena: totalMontoSena,
        monto_deuda: totalDeuda,
        total: totalMontoCancha + totalMontoSena,
      },
    };

    return res.json(resp);
  } catch (err) {
    console.error("estadoRecaudacionRango error:", err);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

//================================================ RECAUDACION -> FORMAS DE PAGO (día + filtros) ===========
async function recaudacionFormasDePago(req, res) {
  try {
    let { fecha, cancha, forma_pago, estado_pago } = req.params;
    const sFecha = String(fecha || "").trim();

    cancha = decodeURIComponent(String(cancha || "")).trim();
    forma_pago = decodeURIComponent(String(forma_pago || "")).trim();
    estado_pago = decodeURIComponent(String(estado_pago || "")).trim();

    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    if (!YMD.test(sFecha)) {
      return res.status(400).json({ ok: false, msg: "Fecha inválida (YYYY-MM-DD)" });
    }
    const [y, m, d] = sFecha.split("-").map(Number);
    const dayUTC = new Date(Date.UTC(y, m - 1, d));

    let canchaRow = null;
    if (cancha && cancha.toUpperCase() !== "TODAS") {
      canchaRow = await prisma.cancha.findFirst({
        where: { estado: "activo", nombre: { equals: cancha, mode: "insensitive" } },
        select: { id: true, nombre: true },
      });
      if (!canchaRow) return res.status(404).json({ ok: false, msg: "Cancha no encontrada (activa)" });
    }

    const norm = (s = "") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    let forma = norm(forma_pago || "TODAS");
    let estado = norm(estado_pago || "TODAS");
    if (forma === "SENA") forma = "SEÑA";
    if (estado === "SENA") estado = "SEÑA";

    const q = req.query || {};
    const limit = Number(q.limite ?? q.limit ?? 10);
    const page = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = page ? (page - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const take = Math.max(1, Math.min(100, limit));

    // 1) Filtro inteligente que incluye lectura de la nueva tabla Pagos
    const where = {
      estado: "activo",
      fechaCopia: dayUTC,
      ...(canchaRow ? { canchaId: canchaRow.id } : {}),
      ...(estado !== "TODAS" ? { estado_pago: { equals: estado, mode: "insensitive" } } : {}),
      ...(forma !== "TODAS"
        ? {
            OR: [
              { pagos: { some: { forma_pago: { equals: forma, mode: "insensitive" } } } },
              { pagos: { none: {} }, forma_pago: { contains: forma, mode: "insensitive" } }
            ]
          }
        : {}),
    };

    let precioBase = 0;
    if (canchaRow) {
      const conf = await prisma.configuracion.findFirst({
        where: { canchaId: canchaRow.id },
        orderBy: { createdAt: "desc" },
      });
      precioBase = Number(conf?.monto_cancha ?? 0);
    }

    // 2) Extraemos TODAS las reservas del día para calcular la matemática perfecta en memoria
    const allRows = await prisma.reserva.findMany({
      where,
      orderBy: [{ hora: "asc" }, { id: "asc" }],
      include: {
        cancha: { select: { nombre: true } },
        cliente: { select: { nombre: true, apellido: true, dni: true } },
        usuario: { select: { user: true } },
        pagos: true // <-- Leemos los tickets exactos
      },
    });

    const total = allRows.length;
    
    let totalMontoCancha = 0;
    let totalMontoSena = 0;
    let totalDeuda = 0;
    let dineroRealIngresado = 0; // Esta es la caja real

    const reservasCompletas = allRows.map((r) => {
      const consolidado = Number(r.monto_cancha || 0);
      const senia = Number(r.monto_sena || 0);

      // Sumamos cuánto se pagó realmente revisando ticket por ticket
      let totalPagado = 0;
      let pagadoFiltro = 0;

      if (r.pagos && r.pagos.length > 0) {
        totalPagado = r.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
        
        // Sumamos a la caja SOLO los tickets que coincidan con la forma de pago buscada
        pagadoFiltro = r.pagos
          .filter(p => forma === "TODAS" || p.forma_pago.toUpperCase() === forma)
          .reduce((acc, p) => acc + Number(p.monto), 0);
      } else {
        // Fallback matemático para reservas antiguas
        totalPagado = r.estado_pago === "TOTAL" ? consolidado : (r.estado_pago === "SEÑA" ? senia : 0);
        const match = forma === "TODAS" || (r.forma_pago || "").toUpperCase().includes(forma);
        pagadoFiltro = match ? totalPagado : 0;
      }

      // Cálculo de deuda real y blindada contra números negativos
      let deuda = 0;
      if (canchaRow) {
        deuda = Math.max(0, precioBase - totalPagado);
      }

      totalMontoCancha += (r.estado_pago === "TOTAL" ? totalPagado : 0);
      totalMontoSena += (r.estado_pago === "SEÑA" ? totalPagado : 0);
      totalDeuda += deuda;
      dineroRealIngresado += pagadoFiltro; // Lo que va a la caja

      return {
        ...r,
        monto_cancha: consolidado,
        monto_sena: senia,
        monto_deuda: deuda,
        fecha: anchorDateObj(r.fechaCopia),
        start: anchorDateObj(r.fechaCopia),
        end: anchorDateObj(r.fechaCopia),
        fechaCopia: anchorDateObj(r.fechaCopia),
        pagos: r.pagos ? r.pagos.map(p => ({ ...p, monto: Number(p.monto) })) : []
      };
    });

    // 3) Paginamos el resultado final
    const reservas = reservasCompletas.slice(skip, skip + take);

    const resp = {
      ok: true,
      total,
      reservas,
      limite: take,
      desde: skip,
      filtro: {
        fecha: sFecha,
        cancha: canchaRow ? canchaRow.nombre : "TODAS",
        forma_pago: forma !== "TODAS" ? forma : "TODAS",
        estado_pago: estado !== "TODAS" ? estado : "TODAS",
      },
      totales: {
        monto_cancha: totalMontoCancha,
        monto_sena: totalMontoSena,
        monto_deuda: totalDeuda,
        total: dineroRealIngresado, // El valor matemático exacto de la caja
      },
    };
    if (page) {
      resp.page = page;
      resp.pages = Math.max(1, Math.ceil(total / take));
    }

    return res.json(resp);
  } catch (err) {
    console.error("recaudacionFormasDePago error:", err);
    return res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//================================================RESERVAS_ELIMINADAS====================================
async function reservasEliminadasRango(req, res) {
  try {
    const { estado_pago, fechaIni, fechaFin } = req.params;

    // 1) Validación y normalización de fechas (YYYY-MM-DD)
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    const sIni = String(fechaIni || "").trim();
    const sFin = String(fechaFin || "").trim();
    if (!YMD.test(sIni) || !YMD.test(sFin)) {
      return res.status(400).json({ ok: false, msg: "Rango de fechas inválido" });
    }
    const [y1, m1, d1] = sIni.split("-").map(Number);
    const [y2, m2, d2] = sFin.split("-").map(Number);
    const ini = new Date(Date.UTC(y1, m1 - 1, d1));
    const fin = new Date(Date.UTC(y2, m2 - 1, d2));
    if (isNaN(ini) || isNaN(fin) || ini > fin) {
      return res.status(400).json({ ok: false, msg: "Rango de fechas inválido" });
    }

    // 2) Paginación
    const q = req.query || {};
    const limit = Math.max(1, Math.min(100, Number(q.limit ?? q.limite ?? 10)));
    const pageQ = q.page ? Math.max(1, Number(q.page)) : null;
    const desde = pageQ ? (pageQ - 1) * limit : Number(q.desde ?? 0);
    const skip = Math.max(0, desde);
    const page = pageQ ?? Math.floor(skip / limit) + 1;

    // 3) Filtro base
    const where = {
      estado: "inactivo",
      fechaCopia: { gte: ini, lte: fin },
    };

    // 4) Filtro por estado de pago
    let estado = String(estado_pago || "TODAS").trim().toUpperCase();
    if (estado === "SENA") estado = "SEÑA";
    if (estado !== "TODAS") where.estado_pago = estado;

    // 5) Total + registros (traemos cancha + último historial CANCELAR)
    const [totalItems, rows] = await Promise.all([
      prisma.reserva.count({ where }),
      prisma.reserva.findMany({
        where,
        orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }],
        skip,
        take: limit,
        select: {
          id: true,
          fechaCopia: true,
          hora: true,
          estado_pago: true,
          estado: true,
          user: true,
          title: true,
          nombreCliente: true,
          apellidoCliente: true,
          monto_cancha: true,
          monto_sena: true,
          cancha: { select: { nombre: true } },
          historicos: {
            where: { action: "CANCELAR" },
            orderBy: { version: "desc" },
            take: 1,
            select: { changedAt: true },
          },
        },
      }),
    ]);

    // 6) Formateo de salida
    const reservasFormateadas = rows.map((r) => {
      const canchaNombre = r?.title || r?.cancha?.nombre || "";
      const eliminadaEn = r?.historicos?.[0]?.changedAt ?? null;

      const base = {
        nombre: r.nombreCliente,
        apellido: r.apellidoCliente,
        fecha: anchorDateObj(r.fechaCopia),
        eliminadaEn,   // 👈 NUEVO: fecha de eliminación
        cancha: canchaNombre,
        hora: r.hora,
        estadoPago: r.estado_pago,
        estado: r.estado,
        usuario: r.user,
      };

      const monto_total = Number(r.monto_cancha || 0);
      const monto_sena  = Number(r.monto_sena || 0);

      switch (estado) {
        case "TOTAL": return { ...base, monto_total };
        case "SEÑA":  return { ...base, monto_sena };
        case "IMPAGO": return base;
        default: return { ...base, monto_total, monto_sena };
      }
    });

    return res.status(200).json({
      ok: true,
      reservasFormateadas,
      page,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      totalItems,
    });
  } catch (err) {
    console.error("reservasEliminadasRango error:", err);
    return res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
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
