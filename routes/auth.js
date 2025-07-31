const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const { validarCampos } = require("../middlewares/validar-campos");
const { validarJWT } = require("../middlewares/validar-jwt");
const {
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  getUsuario,
  loginUsuario,
  getUsuarioPorUser,
  revalidartoken,
  buscarUsuarios,
} = require("../controllers/auth");

router.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    msg: "API Auth activa",
  });
});
router.post(
  "/new",
  [
    //midlewares
    check("nombre", "El nombre es obligatorio").not().isEmpty(),
    check("apellido", "El apellido es obligatorio").not().isEmpty(),
    check("celular", " El celular es obligatorio").not().isEmpty(),
    check("tipo_usuario", " Debe seleccionar un tipo de usuario")
      .not()
      .isEmpty(),
    check("email", "El email es obligatorio").isEmail(),
    check("password", "El password debe ser de 6 caracteres").isLength({
      min: 6,
    }),
    validarCampos,
  ],
  crearUsuario
);

router.post(
  "/",
  [
    check("user", "El nombre de usuario es obligatorio").not().isEmpty(),

    validarCampos,
  ],
  loginUsuario
);

router.get("/renew", validarJWT, revalidartoken);
router.get("/", getUsuario);
router.get("/buscar/:termino", validarJWT, buscarUsuarios);
router.get("/:apellido", getUsuarioPorUser);
router.put("/actualizar/:id", actualizarUsuario);
router.delete("/:id", validarJWT, eliminarUsuario);

module.exports = router;
