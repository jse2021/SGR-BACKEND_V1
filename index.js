const express = require('express');
require('dotenv').config();
const { dbConection } = require('./database/config');

// CREAR SERVIDOR express
const app = express();

// BASE DE DATOS
dbConection();

// =======================
// ✅ CORS DEFINITIVO para Localhost + Vercel
// =======================
app.use((req, res, next) => {
  const origin = req.headers.origin || '';

  let isAllowed = false;

  // Permitir localhost
  if (origin.startsWith('http://localhost:5173')) {
    isAllowed = true;
  }

  // Permitir *.vercel.app usando expresión regular defensiva
  try {
    const hostname = new URL(origin).hostname;
    if (hostname.endsWith('.vercel.app')) {
      isAllowed = true;
    }
  } catch (err) {
    // no hacer nada si new URL falla
  }

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});


// DIRECTORIO PUBLICO
app.use(express.static('public'));

// LECTURA Y PARSEO DEL BODY
app.use(express.json());

// RUTAS
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cliente', require('./routes/cliente'));
app.use('/api/cancha', require('./routes/cancha'));
app.use('/api/reserva', require('./routes/reserva'));
app.use('/api/configuracion', require('./routes/configuracion'));

// ESCUCHAR PETICIONES
app.listen(process.env.PORT, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});
