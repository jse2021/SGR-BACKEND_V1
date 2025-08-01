/**
 * Script para actualizar campo estado = "activo"
 */

const mongoose = require("mongoose");
const Reserva = require("./Reserva");

mongoose.connect(
  "mongodb+srv://maldonadojose201422:IrTP0NHhLwsCU5id@cluster0.ng6lkao.mongodb.net/sgr_db",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

async function actualizarEstado() {
  try {
    const resultado = await Reserva.updateMany(
      { estado: { $exists: false } },
      { $set: { estado: "activo" } }
    );
    console.log(`Registros actualizados: ${resultado.modifiedCount}`);
  } catch (err) {
    console.error("Error actualizando reservas:", err);
  } finally {
    mongoose.disconnect();
  }
}

actualizarEstado();
