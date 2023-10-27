const express = require('express');
const router = express.Router();
const {check} = require('express-validator')
const {validarCampos} = require('../middlewares/validar-campos')
const {validarJWT} = require('../middlewares/validar-jwt')
const {crearUsuario, actualizarUsuario, eliminarUsuario, 
    getUsuario ,loginUsuario, getUsuarioPorUser, revalidartoken} = require('../controllers/auth')


router.post('/new', 
[ //midlewares
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('celular', ' El celular es obligatorio').not().isEmpty(),
    check('tipo_usuario', ' Debe seleccionar un tipo de usuario').not().isEmpty(),
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password debe ser de 6 caracteres').isLength({min:6}), validarCampos
], crearUsuario)

router.post('/',
[
    check('user', 'El nombre de usuario es obligatorio').not().isEmpty(),
    check('password', 'El password debe ser de 6 caracteres').isLength({min:6}), validarCampos
], loginUsuario)
 
router.get('/renew', validarJWT, revalidartoken)
router.get('/', getUsuario)
router.get('/:apellido',getUsuarioPorUser)
router.put('/:user', actualizarUsuario);
router.delete('/:user', eliminarUsuario);




module.exports = router;
