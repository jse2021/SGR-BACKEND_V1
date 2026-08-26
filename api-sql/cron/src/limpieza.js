const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const iniciarLimpiezaWeb = () => {
  // El reloj se ejecuta cada minuto exacto
  cron.schedule('* * * * *', async () => {
    try {
      const ahora = new Date();
      
      // 1. Buscar reservas web, impagas, activas, que ya superaron sus 20 minutos
      const expiradas = await prisma.reserva.findMany({
        where: {
          origen: "WEB",
          estado_pago: "IMPAGO",
          estado: "activo",
          expiraAt: { lte: ahora }
        }
      });

      if (expiradas.length === 0) return;

      console.log(`⏱️ Cron: Liberando ${expiradas.length} turnos web vencidos...`);

      // 2. Inactivar y guardar auditoría atómicamente
      for (const res of expiradas) {
        await prisma.$transaction(async (tx) => {
          // Soft delete
          const updated = await tx.reserva.update({
            where: { id: res.id },
            data: { estado: "inactivo" }
          });

          // Historial de la caída
          const nextVersion = (await tx.reservaHist.count({ where: { reservaId: res.id } })) + 1;
          
          await tx.reservaHist.create({
            data: {
              reservaId: updated.id,
              version: nextVersion,
              action: "EXPIRACION_AUTOMATICA",
              estado: updated.estado,
              user: "SISTEMA_CRON",
              origen: updated.origen,
              expiraAt: updated.expiraAt,
              nombreCliente: updated.nombreCliente,
              apellidoCliente: updated.apellidoCliente,
              clienteId: updated.clienteId,
              canchaId: updated.canchaId,
              estado_pago: updated.estado_pago,
              forma_pago: updated.forma_pago,
              monto_cancha: updated.monto_cancha,
              monto_sena: Number(updated.monto_sena || 0),
              fecha: updated.fecha,
              fechaCopia: updated.fechaCopia,
              hora: updated.hora,
              title: updated.title,
              start: updated.start,
              end: updated.end
            }
          });
        });
      }
    } catch (error) {
      console.error("Error en cron de limpieza web:", error);
    }
  });
};

module.exports = { iniciarLimpiezaWeb };