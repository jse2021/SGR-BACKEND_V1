/**
 * DEFINIMOS RUTAS
 */
const express = require('express')
const router = express.Router();
const {validationResult, check} =  require('express-validator')
const {validarCampos} = require('../middlewares/validar-campos')
const {crearMontoCancha,getMontoCanchas, actualizarMontoCancha,getCanchasPrecio,getMontoCanchaId} = require('../controllers/configuracion')


router.post('/crearMonto', [
    check('nombre','El nombre de la cancha es obligatorio').not().isEmpty(),
    check('monto_cancha','el monto de la cancha es obligatorio').not().isEmpty(),
    check('monto_sena','el monto de la seña es obligatorio').not().isEmpty(),
    validarCampos

],crearMontoCancha)

router.get('/id/:idCancha', getMontoCanchaId); 
router.get('/:nombre',getMontoCanchas),
router.get('/',getCanchasPrecio)
router.put('/:nombre',[
    check('monto_cancha','el monto de la cancha es obligatorio').not().isEmpty(),
    check('monto_sena','el monto de la seña es obligatorio').not().isEmpty(),
    validarCampos

], actualizarMontoCancha)

module.exports = router;