const { PrismaClient } = require('@prisma/client');
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
        msg: "El teléfono y los datos del turno son obligatorios" 
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
            esExpress: true
          }
        });
      }

      // NUEVO: 3. Buscar el ID real de la Cancha (Prisma necesita el ID, no el texto)
      const canchaRow = await tx.cancha.findFirst({
        where: { nombre: { equals: cancha, mode: "insensitive" } }
      });

      if (!canchaRow) {
        return res.status(400).json({ ok: false, msg: "La cancha solicitada no existe" });
      }

      // 4. Crear el candado de tiempo (20 minutos hacia el futuro)
      const fechaExpiracion = new Date();
      fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 20);

      // 5. Crear la reserva transitoria (Usando canchaId)
      const reserva = await tx.reserva.create({
        data: {
          clienteId: clienteWeb.id,
          canchaId: canchaRow.id, // <--- CAMBIO CLAVE: Usamos canchaId, no el texto 'cancha'
          fecha: new Date(fecha),
          fechaCopia: new Date(fecha),
          hora: hora,
          estado_pago: "IMPAGO",
          forma_pago: "TRANSFERENCIA",
          estado: "activo",
          monto_cancha: Number(monto_cancha || 0),
          origen: "WEB",
          expiraAt: fechaExpiracion,
          nombreCliente: clienteWeb.nombre,
          apellidoCliente: clienteWeb.apellido
        }
      });
// 5. Conservar la trazabilidad
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
          
          // NUEVO: Replicamos los IDs obligatorios para el historial
          clienteId: reserva.clienteId,
          canchaId: reserva.canchaId
        }
      });

      return reserva;
    });

    res.status(201).json({
      ok: true,
      msg: "Reserva pre-confirmada. Esperando comprobante.",
      reserva: nuevaReserva
    });

  } catch (error) {
    // Imprimimos el error real en la terminal negra para nosotros
    console.error("Error en crearReservaWeb:", error); 
    
    // Le devolvemos un texto seguro al navegador (sin enviar el objeto error crudo)
    return res.status(500).json({ 
      ok: false, 
      msg: "Error interno al procesar la reserva web" 
    });
  }
};

module.exports = {
  crearReservaWeb
};