/**
 * Reservas Routes
 * /api/reserva
 */
const {Router} = require('express')
const {validarJWT} = require('../middlewares/validar-jwt')
const {getReserva, crearReserva, getReservaFecha, getReservaFechaCancha, getReservaClienteRango, 
    actualizarReserva, eliminarReserva,estadoReservasPorFecha, estadoRecaudacion, recaudacionFormasDePago} = require('../controllers/reserva')
const router = Router();
const {check} = require('express-validator')
const {validarCampos} = require('../middlewares/validar-campos')
const {isDate} = require('../helpers/isDate')


// Todas las peticiones tinene que pasar por el validarJWT
router.use(validarJWT);

// Crear una reserva
router.post('/',
[
    check('hora','El horario no puede estar vacio').not().isEmpty(),
    check('estado_pago','Debe seleccionar un estado de pago').not().isEmpty(),
    check('fecha','La fecha es obligatoria').custom(isDate),
    check('cancha','Debe seleccionar una cancha').not().isEmpty(),
    check('cliente','Debe indicar un cliente').not().isEmpty(),
    check('forma_pago','Debe indicar la forma de pago').not().isEmpty(),
    validarCampos
],
 crearReserva);

 // Obtener Reservas

router.get('/:fechaCopia/:cancha/:forma_pago/:estado_pago',recaudacionFormasDePago); 
router.get('/:cancha/:fechaCopia',estadoRecaudacion);
router.get('/:estado_pago/:fechaIni/:fechaFin',estadoReservasPorFecha);
router.get('/',getReserva);
router.get('/:fechaCopia',getReservaFecha);
router.get('/:fechaCopia/:cancha', getReservaFechaCancha);
router.get('/:apellidoCliente/:fechaIni/:fechaFin', getReservaClienteRango);
        
// actualizar Reserva
router.put('/:id',  actualizarReserva);

// Borrar Reserva
router.delete('/:id', eliminarReserva);


module.exports = router