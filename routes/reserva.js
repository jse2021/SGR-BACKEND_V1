/**
 * Reservas Routes
 * /api/reserva
 */
const { Router } = require("express");
const { validarJWT } = require("../middlewares/validar-jwt");
const {
  getReserva,
  crearReserva,
  getReservaFecha,
  getReservaFechaCancha,
  getReservaClienteRango,
  actualizarReserva,
  eliminarReserva,
  //   estadoReservasPorFecha,
  estadoRecaudacion,
  recaudacionFormasDePago,
  getCanchaHora,
  obtenerHorasDisponibles,
  obtenerMontoPorEstado,
} = require("../controllers/reserva");
const router = Router();
const { check } = require("express-validator");
const { validarCampos } = require("../middlewares/validar-campos");
const { isDate } = require("../helpers/isDate");

// Todas las peticiones tinen que pasar por el validarJWT
router.use(validarJWT);

// Crear una reserva
router.post(
  "/",
  [
    check("hora", "El horario no puede estar vacio").not().isEmpty(),
    check("estado_pago", "Debe seleccionar un estado de pago").not().isEmpty(),
    check("fecha", "La fecha es obligatoria").custom(isDate),
    check("cancha", "Debe seleccionar una cancha").not().isEmpty(),
    check("cliente", "Debe indicar un cliente").not().isEmpty(),
    check("forma_pago", "Debe indicar la forma de pago").not().isEmpty(),
    validarCampos,
  ],
  crearReserva
);

//vincular para consultar cancha y horarios disponibles segun dia elegido
router.post("/horarios-disponibles", validarJWT, obtenerHorasDisponibles);

//obtener montos segun estado de pago seleccionado
router.post("/obtener-monto", validarJWT, obtenerMontoPorEstado);

// Obtener Reservas
//RUTAS ESPECIFICAS
router.get(
  "/:fechaCopia/:cancha/:forma_pago/:estado_pago",
  recaudacionFormasDePago
);
router.get("/:fecha/:cancha", getReservaFechaCancha);
router.get("/recaudacion/:cancha/:fechaCopia", estadoRecaudacion);
router.get("/:cliente/:fechaIni/:fechaFin", getReservaClienteRango);
//RUTAS GENERICAS
router.get("/:fechaCopia", getReservaFecha);
router.get("/", getReserva);

// actualizar Reserva
router.put("/:id", actualizarReserva);

// Borrar Reserva
router.delete("/:id", eliminarReserva);

module.exports = router;
