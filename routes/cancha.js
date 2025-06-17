/**
 * DEFINIMOS RUTAS
 */
const express = require('express')
const router = express.Router();
const {validationResult, check} =  require('express-validator')
const {validarCampos} = require('../middlewares/validar-campos')
const {crearCancha, actualizarCancha,eliminarCancha, buscarCancha,getCancha,getCanchaPorNombre} = require('../controllers/cancha')


router.post('/crearCancha', [
    check('nombre','El nombre es obligatorio').not().isEmpty(),
    check('medidas','Las medidas son obligatorias').not().isEmpty(),
    validarCampos

],crearCancha)


router.get("/buscar/:termino", buscarCancha);
router.put("/actualizar/:id", actualizarCancha);
router.delete("/:id", eliminarCancha);
router.get('/', getCancha);
router.get('/:nombre',getCanchaPorNombre)


module.exports = router;