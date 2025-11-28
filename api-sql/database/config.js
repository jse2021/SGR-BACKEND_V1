/**
 * CONECTO LA APP CON LA BASE DE DATOS
 */

const mongoose = require("mongoose");

const dbConection = async () => {
  try {
    await mongoose.connect(process.env.DB_CNN);
    console.log("Base de datos corriendo correctamente");
  } catch (error) {
    console.log({ error });
    throw new Error("Error al conectar a la base de datos");
  }
};

module.exports = {
  dbConection,
};

process.env.DB_CNN;
