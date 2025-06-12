const { response } = require("express");
const { validationResult } = require("express-validator");
const Cliente = require("../models/Cliente");
//---------------------------------------------------------------------------------------------
/**
 * CREAR CLIENTE
 * DNI - EMAIL DEBEN SER UNICOS
 */

const crearCliente = async (req, res = response) => {
  const { dni, nombre, apellido, email } = req.body;

  try {
    let cliente = await Cliente.findOne({ dni });

    if (cliente) {
      return res.status(400).json({
        ok: false,
        msg: "Dni ingresado esta asociado a otro cliente",
        dni: cliente.dni,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
      });
    }
    let clienteEmail = await Cliente.findOne({ email });

    if (clienteEmail) {
      return res.status(400).json({
        ok: false,
        msg: "Email ingresado esta asociado a otro cliente",
        nombre: clienteEmail.nombre,
        apellido: clienteEmail.apellido,
        email: clienteEmail.email,
      });
    }
    cliente = new Cliente(req.body);
    await cliente.save();
    res.status(201).json({
      ok: true,
      msg: "Cliente registrado exitosamente",
      nombre,
      apellido,
    });
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//---------------------------------------------------------------------------------------------
/**
 * CONSULTA TODOS LOS CLIENTES
 * TRAE TODOS, LUEGO EN EL FRONT APLICAMOS FILTRO
 */

const buscarCliente = async (req, res = response) => {
  const { termino } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 5;
  const skip = (page - 1) * limit;
  // const clientes = await Cliente.find();

  try {
    const regex = new RegExp(termino, "i"); // 'i' para que no distinga mayúsculas/minúsculas
  const [clientes, total] = await Promise.all([
        Cliente.find({
          $or: [{ nombre: regex }, { apellido: regex }, { dni: regex }],
        })
          .skip(skip)
          .limit(limit),
        Cliente.countDocuments({
          $or: [{ nombre: regex }, { apellido: regex }, { dni: regex }],
        }),
      ]);
      console.log(clientes)
     res.json({
      ok: true,
      clientes,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Clientes encontrados",
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
 * ACTUALIZAR CLIENTE
 * EL FILTRO SE REALIZA DESDE EL FRONT END
 * ACTUALIZADO POR DNI
 */

const actualizarCliente = async (req, res = response) => {
  const { dni } = req.params;

  try {
    const cliente = await Cliente.findOne({ dni });
    if (!cliente) {
      return res.status(400).json({
        ok: false,
        msg: "El cliente no existe en la base de datos",
      });
    }

    const nuevoCliente = {
      ...req.body,
    };
    //new:true, significa que va a retorar los datos actualizados
    const clienteActualizado = await Cliente.findOneAndUpdate(
      { dni },
      nuevoCliente,
      { new: true }
    );
    res.json({
      ok: true,
      cliente: nuevoCliente,
      msg: "Cliente Actualizado",
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
 * ELIMINAR CLIENTE - EL FILTRO SE HACE DESDE EL FRONT
 * CLIENTE ELIMINADO POR DNI
 */
const eliminarCliente = async (req, res = response) => {
  const { dni } = req.params;
  try {
    const cliente = await Cliente.findOne({ dni });
    if (!cliente) {
      return res.status(400).json({
        ok: false,
        msg: "Cliente inexistente",
      });
    }

    await Cliente.findOneAndDelete({ dni });

    res.json({
      ok: true,
      msg: "Cliente Eliminado",
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
  crearCliente,
  buscarCliente,
  actualizarCliente,
  eliminarCliente,
};
