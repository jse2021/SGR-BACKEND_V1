const { response } = require("express");
const { validationResult } = require("express-validator");
const Configuracion = require("../models/configuracion");
const mongodb = require("mongodb");
const configuracion = require("../models/configuracion");
const Cancha = require("../models/Cancha");

/**
 * CREAR CONFIGURACION MONTOS
 */

const crearMontoCancha = async (req, res = response) => {
  const { nombre } = req.body;
  // Traigo todas las canchas
  try {
    const canchaDb = await Cancha.findOne({
      nombre: req.body.nombre,
    });
 
    if (canchaDb) {
      const configuracion = new Configuracion(req.body);
      const configuracionCancha = await Configuracion.findOne({ nombre });

      if (configuracionCancha) {
        return res.status(400).json({
          ok: false,
          msg: "Si desea realizar cambios en la cancha debe actualizar la misma",
        });
      }

      await configuracion.save();

      return res.status(200).json({
        ok: true,
        msg: "Configuracion exitosa",
      });
    } else {
      return res.status(400).json({
        ok: false,
        msg: "Cancha no existe",
      });
    }
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

/**
 * TRAER TODAS LAS CONFIGURACIONES DE UNA CANCHA ESPECIFICA
 */
const getMontoCanchas = async (req, res = response) => {
  const { nombre } = req.params;
  const canchasMonto = await Configuracion.findOne({ nombre });
  try {
    if (!canchasMonto) {
      return res.status(400).json({
        ok: false,
        msg: "No existen configuraciones",
      });
    }
    return res.json({
      ok: true,
      canchasMonto,
      msg: "Listado de configuraciones",
    });
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
/**
 * TRAIGO CONFIGURACION POR ID
 */
const getMontoCanchaId = async (req, res = response) => {
  const { idCancha } = req.params;

  try {
    // Busco el nombre de la cancha en la colección Cancha
    const canchaDb = await Cancha.findById(idCancha);

    if (!canchaDb) {
      return res.status(404).json({
        ok: false,
        msg: "Cancha no encontrada",
      });
    }

    // Busco configuración por nombre
    const configuracion = await Configuracion.findOne({ nombre: canchaDb.nombre });

    if (!configuracion) {
      return res.status(404).json({
        ok: false,
        msg: "No existen configuraciones para esta cancha",
      });
    }

    return res.status(200).json({
      ok: true,
      canchasMonto: configuracion,
      msg: "Configuración encontrada",
    });
  } catch (error) {
    console.log("Error en getMontoCanchaId:", error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
/**
 * TRAER TODAS LAS CANCHAS CON PRECIOS
 */
const getCanchasPrecio = async (req, res = response) => {
  const canchasPrecio = await Configuracion.find();
  console.log(canchasPrecio);

  try {
    if (!canchasPrecio) {
      return res.status(400).json({
        ok: false,
        msg: "No existen configuraciones",
      });
    }
    return res.json({
      ok: true,
      canchasPrecio: canchasPrecio.map((cancha) => ({
        id: cancha.id,
        nombre: cancha.nombre,
        precio_cancha: cancha.monto_cancha,
        precio_sena: cancha.monto_sena,
      })),
      msg: "Listado de configuraciones",
    });
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
/**
 * ACTUALIZAR LAS CANCHAS
 */

const actualizarMontoCancha = async (req, res = response) => {
  const { nombre } = req.params;

  try {
    canchaNombre = await Configuracion.findOne({ nombre });
    if (!canchaNombre) {
      return res.status(400).json({
        ok: false,
        msg: "La cancha no existe en la base de datos",
      });
    }
    const nuevaConfiguracion = {
      ...req.body,
    };
    //new:true, significa que va a retorar los datos actualizados
    const montosActualizados = await Configuracion.findOneAndUpdate(
      { nombre },
      nuevaConfiguracion,
      { new: true }
    );
    res.json({
      ok: true,
      canchaNombre: nuevaConfiguracion,
      msg: "Montos actualizados correctamente",
    });
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

module.exports = {
  crearMontoCancha,
  getMontoCanchas,
  actualizarMontoCancha,
  getCanchasPrecio,
  getMontoCanchaId
};
