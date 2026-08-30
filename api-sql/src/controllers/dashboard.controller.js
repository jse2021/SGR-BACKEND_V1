const { prisma } = require("../db");

// =====================================================================
// CONFIGURACIÓN DEL CLUB (Ajusta este número según tus horarios reales)
// Ej: Si abren de 18hs a 24hs, son 6 turnos por cancha.
// =====================================================================
const TURNOS_POR_DIA_POR_CANCHA = 16;

async function obtenerDashboard(req, res) {
  try {
    // 1) Determinar "Hoy" y "Próxima Semana" (UTC-3 Argentina)
    const nowUTC = new Date();
    const nowArg = new Date(nowUTC.getTime() + -3 * 3600 * 1000);
    const y = nowArg.getUTCFullYear();
    const m = nowArg.getUTCMonth();
    const d = nowArg.getUTCDate();

    const todayUTC = new Date(Date.UTC(y, m, d));
    const nextWeekUTC = new Date(todayUTC.getTime() + 7 * 24 * 3600 * 1000);

    // 2) Conocer las canchas activas para calcular la capacidad operativa
    const canchasActivas = await prisma.cancha.findMany({
      where: { estado: "activo" },
    });
    const capacidadTotalHoy = canchasActivas.length * TURNOS_POR_DIA_POR_CANCHA;

    // 3) Traer configuraciones para calcular deudas
    const configuraciones = await prisma.configuracion.findMany({
      orderBy: { createdAt: "desc" },
    });
    const confMap = new Map();
    configuraciones.forEach((c) => {
      if (!confMap.has(c.canchaId)) {
        confMap.set(c.canchaId, Number(c.monto_cancha));
      }
    });

    // 4) Consultar Reservas de Hoy
    const reservasHoy = await prisma.reserva.findMany({
      where: { fechaCopia: todayUTC, estado: "activo" },
      include: { pagos: true, cancha: { select: { nombre: true } } },
    });

    // 5) Procesamiento de Métricas
    let ingresado = 0;
    let pendiente = 0;
    let reservasSinSena = 0;
    let ocupacionCanchasHoy = {};

    // Inicializamos todas las canchas en 0 para que aparezcan en el gráfico aunque estén vacías
    canchasActivas.forEach((c) => (ocupacionCanchasHoy[c.nombre] = 0));

    reservasHoy.forEach((r) => {
      // Contabilizar turnos por cancha
      const nombreCancha = r.cancha?.nombre || "Eliminada";
      if (ocupacionCanchasHoy[nombreCancha] !== undefined) {
        ocupacionCanchasHoy[nombreCancha]++;
      }

      // Cálculos financieros
      const precioBase = confMap.get(r.canchaId) || 0;
      const sumaPagos = r.pagos.reduce((acc, p) => acc + Number(p.monto), 0);

      ingresado += sumaPagos;

      if (r.estado_pago === "SEÑA" || r.estado_pago === "IMPAGO") {
        const deuda = Math.max(0, precioBase - sumaPagos);
        pendiente += deuda;
      }

      // Alertas Críticas: Turnos de hoy completamente impagos
      if (r.estado_pago === "IMPAGO") {
        reservasSinSena++;
      }
    });

    // 6) Consolidar datos financieros y de ocupación
    const totalEsperado = ingresado + pendiente;
    const porcentajeOcupacionGlobal =
      capacidadTotalHoy > 0
        ? Math.round((reservasHoy.length / capacidadTotalHoy) * 100)
        : 0;

    const rankingCanchas = Object.keys(ocupacionCanchasHoy)
      .map((name) => {
        const reservas = ocupacionCanchasHoy[name];
        const porcentaje = Math.round(
          (reservas / TURNOS_POR_DIA_POR_CANCHA) * 100,
        );
        return {
          name,
          reservas,
          porcentaje: porcentaje > 100 ? 100 : porcentaje,
        };
      })
      .sort((a, b) => b.porcentaje - a.porcentaje);

    // =================================================================
    // NUEVO: CÁLCULO DE TURNOS FIJOS POR VENCER (Próximos 7 días)
    // =================================================================
    const turnosFijosActivos = await prisma.reserva.groupBy({
      by: ["turnoFijoId"],
      where: {
        estado: "activo",
        turnoFijoId: { not: null },
        fechaCopia: { gte: todayUTC }, // Miramos de hoy en adelante
      },
      _max: {
        fechaCopia: true, // Obtenemos la última fecha de cada turno fijo
      },
    });

    let turnosFijosPorVencer = 0;
    turnosFijosActivos.forEach((grupo) => {
      // Si la última fecha del turno cae antes de la próxima semana, está por vencer
      if (grupo._max.fechaCopia && grupo._max.fechaCopia <= nextWeekUTC) {
        turnosFijosPorVencer++;
      }
    });

    // 7) Respuesta Final
    return res.status(200).json({
      ok: true,
      data: {
        ocupacionHoy: {
          porcentaje: porcentajeOcupacionGlobal,
          ocupados: reservasHoy.length,
          total: capacidadTotalHoy,
        },
        finanzas: {
          ingresado,
          pendiente,
          totalEsperado,
        },
        rankingCanchas,
        alertas: {
          reservasSinSena,
          turnosFijosPorVencer, // <--- AHORA SÍ ES UN DATO REAL DINÁMICO
        },
      },
    });
  } catch (error) {
    console.error("Error en obtenerDashboard:", error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

module.exports = {
  obtenerDashboard,
};
