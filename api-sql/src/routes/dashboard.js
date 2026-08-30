/**
 * DEFINIMOS RUTAS DE DASHBOARD
 */
const { Router } = require("express");
const { validarJWT } = require("../middlewares/validar-jwt");
const { obtenerDashboard } = require("../controllers/dashboard.controller");

const router = Router();

// Todas las rutas de dashboard pasan por la validación del token
router.use(validarJWT);

// Ruta base: /api/dashboard
router.get("/", obtenerDashboard);

module.exports = router;
