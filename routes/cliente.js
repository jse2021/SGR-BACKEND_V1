/**
 * DEFINIMOS RUTAS
 */
const express = require("express");
const router = express.Router();
const { validationResult, check } = require("express-validator");
const { validarCampos } = require("../middlewares/validar-campos");
const {
  crearCliente,
  buscarCliente,
  
  actualizarCliente,
  eliminarCliente,
} = require("../controllers/cliente");

router.post(
  "/crearCliente",
  [
    check("dni", "El dni es obligatorio").not().isEmpty(),
    check("dni", "El dni debe ser de 8 caracteres").isLength({ min: 8 }),
    check("dni", "El dni debe ser de 8 caracteres").isLength({ max: 8 }),
    check("nombre", "El nombre es obligatorio").not().isEmpty(),
    check("apellido", "El apellido es obligatorio").not().isEmpty(),
    check("email", "El email es obligatorio").not().isEmpty(),
    check("celular", "El numero de celular es obligatorio").not().isEmpty(),
    validarCampos,
  ],
  crearCliente
);

router.get("/buscar/:termino", buscarCliente);
router.delete("/:id", eliminarCliente);
router.put("/actualizar/:id", actualizarCliente);

module.exports = router;
