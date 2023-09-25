/**
 * DEFINIMOS RUTAS
 */
const express = require('express')
const router = express.Router();
const {validationResult, check} =  require('express-validator')
const {validarCampos} = require('../middlewares/validar-campos')
const {crearCancha, getCancha, getCanchaPorNombre, actualizarCancha,eliminarCancha} = require('../controllers/cancha')


router.post('/crearCancha', [
    check('nombre','El nombre es obligatorio').not().isEmpty(),
    check('medidas','Las medidas son obligatorias').not().isEmpty(),
    validarCampos

],crearCancha)


router.get('/', getCancha);
router.get('/:nombre',getCanchaPorNombre)
router.put('/:nombre', actualizarCancha);
router.delete('/:nombre',eliminarCancha)



module.exports = router;