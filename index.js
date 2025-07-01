const express = require('express');
require('dotenv').config();
// const cors = require('cors')
const {dbConection}=require('./database/config')

// CREAR SERVIDOR express
const app = express();

// BASE DE DATOS
dbConection()       ;
// CORS
// app.use(cors());


const allowedOrigins = [
  "http://localhost:5173",
  "https://sgr-frontend-v1-p5st.vercel.app"
];

// Middleware global para CORS correcto
app.use((req, res, next) => {
  console.log("🌐 Headers:", req.headers); // ✅ Acá sí funciona
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-token");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // ⚠️ Detener la respuesta para solicitudes preflight
  if (req.method === "OPTIONS") {
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
app.listen(process.env.PORT,()=>{
    console.log(`Servidor corriendo en puerto ${process.env.PORT}`)
})