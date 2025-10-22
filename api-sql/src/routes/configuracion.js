const { Router } = require("express");
const { validarJWT } = require("../middlewares/validar-jwt");
const {
  crearMontoCancha,
  getMontoCanchas,
  getMontoCanchaId,
  getCanchasPrecio,
  actualizarMontoCancha,
} = require("../controllers/configuracion.controller");

const router = Router();

router.use(validarJWT); // todas requieren token

router.post("/", crearMontoCancha); // crear configuración de una cancha
router.get("/", getCanchasPrecio); // lista todas
router.get("/nombre/:nombre", getMontoCanchas); // una cancha por nombre
router.get("/id/:idCancha", getMontoCanchaId); // una cancha por id
router.put("/:nombre", actualizarMontoCancha); // actualizar montos por nombre

module.exports = router;
