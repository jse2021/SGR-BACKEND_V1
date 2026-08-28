const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// =====================================================================
// CREAR RESERVA DESDE LA WEB (CON CANDADO DE 20 MIN)
// =====================================================================
const crearReservaWeb = async (req, res) => {
  try {
    const { nombre, telefono, cancha, fecha, hora, monto_cancha } = req.body;

    // 1. Validación de seguridad en el backend
    if (!nombre || !telefono || !cancha || !fecha || !hora) {
      return res.status(400).json({
        ok: false,
        msg: "El teléfono y los datos del turno son obligatorios",
      });
    }

    const nuevaReserva = await prisma.$transaction(async (tx) => {
      // 2. Buscar o crear al cliente usando el teléfono como DNI
      let clienteWeb = await tx.cliente.findFirst({ where: { dni: telefono } });

      if (!clienteWeb) {
        clienteWeb = await tx.cliente.create({
          data: {
            dni: telefono,
            nombre: nombre.trim(),
            apellido: "(Web)",
            telefono: telefono,
            estado: "activo",
            esExpress: true,
          },
        });
      }

      // NUEVO: 3. Buscar el ID real de la Cancha (Prisma necesita el ID, no el texto)
      const canchaRow = await tx.cancha.findFirst({
        where: { nombre: { equals: cancha, mode: "insensitive" } },
      });

      if (!canchaRow) {
        return res
          .status(400)
          .json({ ok: false, msg: "La cancha solicitada no existe" });
      }

      // 4. Crear el candado de tiempo (20 minutos hacia el futuro)
      const fechaExpiracion = new Date();
      fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 20);
      // 5. Crear la reserva transitoria (Usando canchaId y ancla horaria)
      const reserva = await tx.reserva.create({
        data: {
          clienteId: clienteWeb.id,
          canchaId: canchaRow.id,

          // NUEVO: Forzamos las 03:00Z para alinear la zona horaria (UTC-3)
          fecha: new Date(`${fecha}T03:00:00.000Z`),
          fechaCopia: new Date(`${fecha}T03:00:00.000Z`),

          hora: hora,
          estado_pago: "IMPAGO",
          forma_pago: "TRANSFERENCIA",
          estado: "activo",
          monto_cancha: Number(monto_cancha || 0),
          origen: "WEB",
          expiraAt: fechaExpiracion,
          nombreCliente: clienteWeb.nombre,
          apellidoCliente: clienteWeb.apellido,
        },
      });
      // 5. Conservar la trazabilidad completa en el historial
      await tx.reservaHist.create({
        data: {
          reservaId: reserva.id,
          version: 1,
          action: "CREAR_WEB",
          estado: reserva.estado,
          user: "CLIENTE_WEB",
          origen: reserva.origen,
          expiraAt: reserva.expiraAt,
          nombreCliente: reserva.nombreCliente,
          apellidoCliente: reserva.apellidoCliente,
          clienteId: reserva.clienteId,
          canchaId: reserva.canchaId,

          // NUEVO: Campos obligatorios de pago y montos para auditoría
          estado_pago: reserva.estado_pago,
          forma_pago: reserva.forma_pago,
          monto_cancha: reserva.monto_cancha,
          monto_sena: reserva.monto_sena || 0,
          fecha: reserva.fecha,
          fechaCopia: reserva.fechaCopia,
          hora: reserva.hora,
          title: reserva.title || "Reserva Web",
          start: reserva.fecha,
          end: reserva.fecha,
        },
      });

      return reserva;
    });

    res.status(201).json({
      ok: true,
      msg: "Reserva pre-confirmada. Esperando comprobante.",
      reserva: nuevaReserva,
    });
  } catch (error) {
    // Imprimimos el error real en la terminal negra para nosotros
    console.error("Error en crearReservaWeb:", error);

    // Le devolvemos un texto seguro al navegador (sin enviar el objeto error crudo)
    return res.status(500).json({
      ok: false,
      msg: "Error interno al procesar la reserva web",
    });
  }
};
// =====================================================================
// OBTENER CATÁLOGO DE CANCHAS CON SUS PRECIOS (PÚBLICO)
// =====================================================================
const obtenerCanchasWeb = async (req, res) => {
  try {
    // 1. Buscamos solo las canchas activas
    const canchasActivas = await prisma.cancha.findMany({
      where: { estado: "activo" },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    // 2. Buscamos el precio vigente de cada cancha en la tabla Configuracion
    const canchasConPrecio = await Promise.all(
      canchasActivas.map(async (cancha) => {
        const conf = await prisma.configuracion.findFirst({
          where: { canchaId: cancha.id },
          orderBy: { createdAt: "desc" },
        });

        return {
          ...cancha,
          monto_cancha: Number(conf?.monto_cancha || 0),
          monto_sena: Number(conf?.monto_sena || 0),
        };
      }),
    );

    return res.status(200).json({
      ok: true,
      canchas: canchasConPrecio,
    });
  } catch (error) {
    console.error("Error en obtenerCanchasWeb:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error al obtener el catálogo de canchas",
    });
  }
};
// =====================================================================
// CONSULTAR DISPONIBILIDAD DE HORARIOS (PÚBLICO)
// =====================================================================
const obtenerDisponibilidadWeb = async (req, res) => {
  try {
    const { canchaId, fecha } = req.query;

    if (!canchaId || !fecha) {
      return res.status(400).json({
        ok: false,
        msg: "La cancha y la fecha son obligatorias",
      });
    }

    // 1. Rango de 24 horas para absorber las diferencias de zona horaria
    const inicioDia = new Date(`${fecha}T00:00:00.000Z`);
    const finDia = new Date(`${fecha}T23:59:59.999Z`);

    // 2. Buscar turnos ocupados en ese rango
    const reservasOcupadas = await prisma.reserva.findMany({
      where: {
        canchaId: Number(canchaId),
        fecha: {
          gte: inicioDia,
          lte: finDia,
        },
        estado: "activo",
      },
      select: { hora: true },
    });

    const horasBloqueadas = reservasOcupadas.map((r) => r.hora);

    // 3. Grilla base de horarios del complejo
    const grillaCompleta = [
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

    // 4. Filtrar para devolver solo lo libre
    const horasLibres = grillaCompleta.filter(
      (hora) => !horasBloqueadas.includes(hora),
    );

    return res.status(200).json({
      ok: true,
      disponibles: horasLibres,
    });
  } catch (error) {
    console.error("Error en obtenerDisponibilidadWeb:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error al calcular la disponibilidad",
    });
  }
};

module.exports = {
  crearReservaWeb,
  obtenerCanchasWeb,
  obtenerDisponibilidadWeb,
};
