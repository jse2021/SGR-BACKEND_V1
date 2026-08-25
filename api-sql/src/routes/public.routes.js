const { Router } = require('express');
const { crearReservaWeb,obtenerCanchasWeb,obtenerDisponibilidadWeb } = require('../controllers/public.controller');

const router = Router();

// Endpoint público: GET /api/public/canchas
router.get('/canchas', obtenerCanchasWeb); 
// Endpoint público: GET /api/public/disponibilidad?canchaId=1&fecha=2026-08-30
router.get('/disponibilidad', obtenerDisponibilidadWeb); 
// Endpoint público: POST /api/public/reservas
router.post('/reservas', crearReservaWeb);

module.exports = router;