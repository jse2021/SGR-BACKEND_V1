const { Router } = require('express');
const { crearReservaWeb } = require('../controllers/public.controller');

const router = Router();

// Endpoint público: POST /api/public/reservas
router.post('/reservas', crearReservaWeb);

module.exports = router;