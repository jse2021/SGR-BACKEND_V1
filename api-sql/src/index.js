const express = require('express');
const cors = require('cors');
require('dotenv').config();


const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, api: 'sql' }));

app.use('/cliente', require('./routes/cliente.js'));
app.use('/cancha', require('./routes/cancha.js'));
app.use('/auth', require('./routes/auth.js'));
app.use('/configuracion', require('./routes/configuracion.js'));
app.use('/reserva', require('./routes/reserva.js'));



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Base de Datos Corriendo en puerto:${PORT}`));

