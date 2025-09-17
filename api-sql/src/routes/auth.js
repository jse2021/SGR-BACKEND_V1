const express = require('express');
const { check } = require('express-validator');
const { validarCampos } = require('../middlewares/validar-campos');
const { validarJWT } = require('../middlewares/validar-jwt');

const {
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  getUsuario,
  loginUsuario,
  getUsuarioPorUser,
  revalidartoken,
  buscarUsuarios,
} = require('../controllers/auth.controller');

const router = express.Router();

// router.get('/', (_req, res) => res.status(200).json({ ok: true, msg: 'API Auth activa' }));

router.post(
  '/new',
  [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('celular', ' El celular es obligatorio').not().isEmpty(),
    check('tipo_usuario', ' Debe seleccionar un tipo de usuario').not().isEmpty(),
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password debe ser de 6 caracteres').isLength({ min: 6 }),
    check('user', 'El nombre de usuario es obligatorio').not().isEmpty(),
    validarCampos,
  ],
  crearUsuario
);

router.post(
  '/',
  [
    check('user', 'El nombre de usuario es obligatorio').not().isEmpty(),
    validarCampos,
  ],
  loginUsuario
);

router.get('/renew', validarJWT, revalidartoken);
router.get('/buscar/:termino', validarJWT, buscarUsuarios);

// libres (según  1.0)
router.get('/', getUsuario);
router.get('/:apellido', getUsuarioPorUser);
router.put('/actualizar/:id', actualizarUsuario);

// protegida
router.put('/:id', validarJWT, eliminarUsuario);

module.exports = router;
