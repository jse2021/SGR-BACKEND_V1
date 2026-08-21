/**
 * DEFINIMOS RUTAS
 */
const { validarJWT } = require('../middlewares/validar-jwt'); 
const { Router } = require('express');
const {
  crearCliente,
  getCliente,
  getClientePorApellido,
  buscarCliente,
  actualizarCliente,
  eliminarCliente,
  crearClienteExpress
} = require('../controllers/cliente.controller');

const router = Router();
router.use(validarJWT); // todas protegidas

// ==========================================================
// NUEVA RUTA: Cliente Express (Debe ir ANTES de las rutas con :id o parámetros genéricos)
router.post('/express', crearClienteExpress);
// ==========================================================

router.post('/', crearCliente);
router.get('/', getCliente);
router.put('/eliminar/:id', eliminarCliente);
router.get('/apellido/:apellido', getClientePorApellido);
router.get('/buscar/:termino', buscarCliente);         
router.put('/:id', actualizarCliente);

module.exports = router;
