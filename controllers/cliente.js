const { response } = require("express");
const { validationResult } = require("express-validator");
const Cliente = require("../models/Cliente");
const logger = require("../logs/logger");

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
    logger.error(error);
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

    res.json({
      ok: true,
      clientes,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Clientes encontrados",
    });
  } catch (error) {
    logger.error(error);
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

const getCliente = async (req, res = response) => {
  const clientes = await Cliente.find();

  try {
    if (!clientes) {
      return res.status(400).json({
        ok: false,
        msg: "El cliente no existe",
      });
    }

    res.json({
      ok: true,
      clientes,
      msg: "Traigo todos los clientes",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//---------------------------------------------------------------------------------------------
/**
 * ELIMINAR CLIENTE_ID
 */
const eliminarCliente = async (req, res = response) => {
  const clienteId = req.params.id;

  try {
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({
        ok: false,
        msg: "Cliente inexistente",
      });
    }

    await Cliente.findByIdAndDelete(clienteId);

    res.json({
      ok: true,
      msg: "Cliente Eliminado",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//---------------------------------------------------------------------------------------------
/**
 * ACTUALIZAR USUARIO - EL FILTRO SE HACE DESDE EL FRONT
 */

const actualizarCliente = async (req, res = response) => {
  const { id } = req.params;

  try {
    const cliente = await Cliente.findById(id);

    if (!cliente) {
      return res.status(404).json({
        ok: false,
        msg: "Cliente no encontrado",
      });
    }

    const camposActualizados = { ...req.body };

    // Si viene password nueva, encriptar
    if (camposActualizados.password) {
      const salt = bcrypt.genSaltSync();
      camposActualizados.password = bcrypt.hashSync(
        camposActualizados.password,
        salt
      );
    }

    // Validar email duplicado (si cambia)
    if (
      camposActualizados.email &&
      camposActualizados.email !== cliente.email
    ) {
      const emailExistente = await Cliente.findOne({
        email: camposActualizados.email,
      });

      if (emailExistente && emailExistente._id.toString() !== id) {
        return res.status(400).json({
          ok: false,
          msg: "El email ya está registrado por otro cliente",
        });
      }
    }
    // Validar dni duplicado (si cambia)
    /**
     * DESHABILITO LA OPCION CAMBIA DNI, PORQUE AL HABER UNA RESERVA, VA A DEJAR INCONSISTENCIAS.
     * PARA ESO, DEBE ELIMINAR LA RESERVA Y ELIMINAR EL CLIENTE.
     * Y GENERAR UNO NUEVO
     */
    if (camposActualizados.dni && camposActualizados.dni !== cliente.dni) {
      const dniExistente = await Cliente.findOne({
        dni: camposActualizados.dni,
      });

      if (dniExistente && dniExistente._id.toString() !== id) {
        return res.status(400).json({
          ok: false,
          msg: "El DNI ya está registrado por otro cliente",
        });
      }
    }

    const clienteActualizado = await Cliente.findByIdAndUpdate(
      id,
      camposActualizados,
      {
        new: true,
      }
    );

    return res.json({
      ok: true,
      usuario: clienteActualizado,
      msg: "Cliente actualizado correctamente",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Error al actualizar. Hable con el administrador.",
    });
  }
};
//---------------------------------------------------------------------------------------------
/**
 * CONSULTA CLIENTE POR APELLID
 */

const getClientePorApellido = async (req, res = response) => {
  const { apellido } = req.params;

  try {
    const cliente = await Cliente.find({ apellido });
    if (!cliente) {
      return res.status(400).json({
        ok: false,
        msg: "El cliente no existe en la base de datos",
      });
    }
    return res.status(200).json({
      ok: true,
      cliente,
      msg: "Traigo todos los clientes",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

module.exports = {
  crearCliente,
  getCliente,
  getClientePorApellido,
  buscarCliente,
  actualizarCliente,
  eliminarCliente,
};
