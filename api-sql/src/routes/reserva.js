const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');
const {

   crearReserva,
   obtenerHorasDisponibles,
  obtenerMontoPorEstado,
  actualizarReserva,
  eliminarReserva,
  getReservaFechaCancha ,
  getReservaClienteRango,
  estadoReservasRango,
  estadoRecaudacion
} = require('../controllers/reserva.controller');

const router = Router();
router.use(validarJWT);


// 1) Prefijos fijos
router.post('/horarios-disponibles', obtenerHorasDisponibles);
router.post('/obtener-monto', obtenerMontoPorEstado);
router.get('/estadoReservas/:estado_pago/:fechaIni/:fechaFin', estadoReservasRango);
router.get('/recaudacion/:cancha/:fechaIni/:fechaFin', estadoRecaudacion);
// 2) Parametrizadas “largas” (más específicas)
router.get('/:cliente/:fechaIni/:fechaFin', getReservaClienteRango);
router.get('/:fecha/:cancha', getReservaFechaCancha);




// CRUD
router.post(
  '/',
  [
    check('hora', 'El horario no puede estar vacio').not().isEmpty(),
    check('estado_pago', 'Debe seleccionar un estado de pago').not().isEmpty(),
    check('fecha', 'La fecha es obligatoria').not().isEmpty(), // si usás isDate personalizado, agregalo
    check('cancha', 'Debe seleccionar una cancha').not().isEmpty(),
    check('cliente', 'Debe indicar un cliente').not().isEmpty(),
    check('forma_pago', 'Debe indicar la forma de pago').not().isEmpty(),
    validarCampos,
  ],
  crearReserva
);
router.put('/:id', actualizarReserva);
// // Soft delete como en tu Mongo
router.put('/eliminar/:id', eliminarReserva);

module.exports = router;

// router.get('/', getReserva);
// router.get('/reservasEliminadas/:estado_pago/:fechaIni/:fechaFin', (req,res)=>res.status(501).json({ok:false,msg:'(opc) implementable similar a estadoReservasRango filtrando estado=inactivo'}));
// router.get('/:fechaCopia/:cancha/:forma_pago/:estado_pago', recaudacionFormasDePago);


// router.get('/:fechaCopia', getReservaFecha);
// router.get('/:fecha/:cancha', getReservaFechaCancha);