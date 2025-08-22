/**
 * DEFINIMOS RUTAS
 */
const { validarJWT } = require('../middlewares/validar-jwt'); //
const { Router } = require('express');
const {
  crearCliente,
  getCliente,
  getClientePorApellido,
  buscarCliente,
  actualizarCliente,
  eliminarCliente,
} = require('../controllers/cliente.controller');

const router = Router();
router.use(validarJWT); // todas protegidas

router.post('/', crearCliente);
router.get('/', getCliente);
router.get('/apellido/:apellido', getClientePorApellido);
router.get('/buscar/:termino', buscarCliente);         
router.put('/:id', actualizarCliente);
router.delete('/:id', eliminarCliente);

module.exports = router;





