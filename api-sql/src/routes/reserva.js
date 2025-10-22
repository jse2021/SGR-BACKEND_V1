const { Router } = require("express");
const { validarJWT } = require("../middlewares/validar-jwt");
const { check } = require("express-validator");
const { validarCampos } = require("../middlewares/validar-campos");
const { prisma } = require("../db");

const {
  crearReserva,
  obtenerHorasDisponibles,
  obtenerMontoPorEstado,
  actualizarReserva,
  eliminarReserva,
  getReservaFechaCancha,
  getReservaClienteRango,
  estadoReservasRango,
  estadoRecaudacion,
  recaudacionFormasDePago,
  reservasEliminadasRango,
} = require("../controllers/reserva.controller");

const router = Router();
router.use(validarJWT);

// 1) Prefijos fijos
router.post("/horarios-disponibles", obtenerHorasDisponibles);
router.post("/obtener-monto", obtenerMontoPorEstado);
router.get(
  "/estadoReservas/:estado_pago/:fechaIni/:fechaFin",
  estadoReservasRango
);
router.get("/recaudacion/:cancha/:fechaIni/:fechaFin", estadoRecaudacion);
router.get(
  "/recaudacionFP/:fecha/:cancha/:forma_pago/:estado_pago",
  recaudacionFormasDePago
);
router.get(
  "/eliminadas/:estado_pago/:fechaIni/:fechaFin",
  reservasEliminadasRango
);

// 2) Parametrizadas “largas” (más específicas)
router.get("/:cliente/:fechaIni/:fechaFin", getReservaClienteRango);
router.get("/:fecha/:cancha", getReservaFechaCancha);

// CRUD
router.post(
  "/",
  [
    check("hora", "El horario no puede estar vacio").not().isEmpty(),
    check("estado_pago", "Debe seleccionar un estado de pago").not().isEmpty(),
    check("fecha", "La fecha es obligatoria").not().isEmpty(), // si usás isDate personalizado, agregalo
    check("cancha", "Debe seleccionar una cancha").not().isEmpty(),
    check("cliente", "Debe indicar un cliente").not().isEmpty(),
    check("forma_pago", "Debe indicar la forma de pago").not().isEmpty(),
    validarCampos,
  ],
  crearReserva
);

router.get("/", async (req, res) => {
  try {
    const rows = await prisma.reserva.findMany({
      where: { estado: "activo" },
      orderBy: [{ fechaCopia: "asc" }, { hora: "asc" }, { id: "asc" }],
      include: {
        cancha: { select: { nombre: true } },
        cliente: { select: { dni: true, nombre: true, apellido: true } },
      },
    });

    const reservas = rows.map(({ cancha, cliente, ...r }) => ({
      ...r,
      cancha: cancha?.nombre ?? "", // front ya usa string para “cancha”
      cliente: cliente?.dni ?? "", // ← ahora el front ve el DNI en activeEvent.cliente

      monto_cancha: Number(r.monto_cancha || 0),
      monto_sena: Number(r.monto_sena || 0),
    }));

    return res.json({ ok: true, reservas });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
});

router.put("/:id", actualizarReserva);
// // Soft delete como en tu Mongo
router.put("/eliminar/:id", eliminarReserva);

module.exports = router;
