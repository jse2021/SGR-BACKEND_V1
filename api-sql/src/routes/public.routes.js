const { Router } = require('express');
const { check, validationResult } = require('express-validator'); // <--- NUEVA IMPORTACIÓN
const { crearReservaWeb, obtenerCanchasWeb, obtenerDisponibilidadWeb } = require('../controllers/public.controller');

const router = Router();

// Endpoint público: GET /api/public/canchas
router.get('/canchas', obtenerCanchasWeb); 
// Endpoint público: GET /api/public/disponibilidad?canchaId=1&fecha=2026-08-30
router.get('/disponibilidad', obtenerDisponibilidadWeb); 
// Endpoint público: POST /api/public/reservas con Sanitización Estricta
router.post('/reservas', [
  // 1. Reglas de validación y limpieza (escapar caracteres peligrosos)
  check('nombre', 'El nombre es inválido').notEmpty().trim().escape(),
  check('apellido', 'El apellido es inválido').optional().trim().escape(),
  check('telefono', 'El teléfono debe ser numérico y es obligatorio').isNumeric().trim().escape(),
  check('cancha', 'Datos de cancha inválidos').notEmpty().trim().escape(),
  
  // 2. Middleware interceptor: Si hay basura, bloquea antes de ir al controlador
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        ok: false, 
        msg: "Se detectaron caracteres inválidos en el formulario.",
        errores: errors.mapped() 
      });
    }
    next();
  }
], crearReservaWeb);

module.exports = router;