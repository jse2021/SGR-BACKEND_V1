const { createLogger, transports, format } = require("winston");
const fs = require("fs");

// Asegurar que la carpeta y archivo existan
if (!fs.existsSync("logs")) {
  fs.mkdirSync("logs");
}
if (!fs.existsSync("logs/frontend.log")) {
  fs.writeFileSync("logs/frontend.log", "");
}

const logger = createLogger({
  level: "error", // nivel por defecto: solo errores
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: [
    new transports.File({ filename: "logs/error.log" }), // guarda en logs/error.log
    new transports.File({ filename: "logs/frontend.log", level: "info" }), // 💥
  ],
});

module.exports = logger;
