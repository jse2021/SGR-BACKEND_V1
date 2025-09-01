const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');
const {

   crearReserva,
   obtenerHorasDisponibles,
  obtenerMontoPorEstado,
  actualizarReserva,
} = require('../controllers/reserva.controller');

const router = Router();
router.use(validarJWT);

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

router.post('/horarios-disponibles', obtenerHorasDisponibles);
router.post('/obtener-monto', obtenerMontoPorEstado);

// router.get('/recaudacion/:cancha/:fechaIni/:fechaFin', estadoRecaudacion);
// router.get('/estadoReservas/:estado_pago/:fechaIni/:fechaFin', estadoReservasRango);
// router.get('/reservasEliminadas/:estado_pago/:fechaIni/:fechaFin', (req,res)=>res.status(501).json({ok:false,msg:'(opc) implementable similar a estadoReservasRango filtrando estado=inactivo'}));
// router.get('/:fechaCopia/:cancha/:forma_pago/:estado_pago', recaudacionFormasDePago);

// router.get('/:cliente/:fechaIni/:fechaFin', getReservaClienteRango);
// router.get('/:fecha/:cancha', getReservaFechaCancha);

// router.get('/:fechaCopia', getReservaFecha);
// router.get('/', getReserva);

router.put('/:id', actualizarReserva);
// // Soft delete como en tu Mongo
// router.put('/eliminar/:id', eliminarReserva);

module.exports = router;
