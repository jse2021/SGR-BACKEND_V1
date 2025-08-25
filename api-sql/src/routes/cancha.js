/**
 * DEFINIMOS RUTAS
 */
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const {
  crearCancha,
  buscarCancha,
  getCanchaPorNombre,
  getCancha,
  eliminarCancha,
  actualizarCancha,
} = require('../controllers/cancha.controller');

const router = Router();
router.use(validarJWT); 

router.post('/', crearCancha);
router.get('/', getCancha);
router.get('/buscar/:termino', buscarCancha); 
router.get('/nombre/:nombre', getCanchaPorNombre);
router.put('/:id', actualizarCancha);
router.delete('/:id', eliminarCancha);

module.exports = router;