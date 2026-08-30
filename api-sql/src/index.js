const express = require("express");
require("dotenv").config();

const { iniciarLimpiezaWeb } = require("../cron/src/limpieza");

const app = express();

// BASE DE DATOS

const { prisma } = require("./db");

// CORS: Local + Producción, usando variables de entorno

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.FRONTEND_URL,
  "https://cliente-web-swart.vercel.app", // <--- NUEVA LÍNEA: Tu nuevo cliente web
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-token",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static("public"));

// BODY PARSER
app.use(express.json());

// RUTAS

app.use("/api/auth", require("./routes/auth"));
app.use("/api/cliente", require("./routes/cliente"));
app.use("/api/cancha", require("./routes/cancha"));
app.use("/api/reserva", require("./routes/reserva"));
app.use("/api/configuracion", require("./routes/configuracion"));
app.use("/api/dashboard", require("./routes/dashboard"));
// RUTAS WEB
app.use("/api/public", require("./routes/public.routes")); // NUEVO: Rutas abiertas para la Web
app.use("/api/auth", require("./routes/auth"));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ESCUCHAR PETICIONES
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

// Iniciar tareas automáticas en segundo plano
iniciarLimpiezaWeb();

app.listen(process.env.PORT, () => {
  console.log("Servidor corriendo en puerto", process.env.PORT);
});
