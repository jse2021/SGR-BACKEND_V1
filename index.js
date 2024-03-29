const express = require('express');
require('dotenv').config();
const cors = require('cors')
const {dbConection}=require('./database/config')

// CREAR SERVIDOR express
const app = express();

// BASE DE DATOS
dbConection()       ;


// CORS
app.use(cors());


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