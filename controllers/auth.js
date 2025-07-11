const { response } = require("express");
const logger = require("../logs/logger");
const bcrypt = require("bcryptjs");
const Usuario = require("../models/Usuario");
const { generarJWT } = require("../helpers/jwt");

let tipoUsuario;

/**
 * LOGIN USUARIO - CON USER - PASSWORD
 */

const loginUsuario = async (req, res = response) => {
  const { user, password } = req.body;

  try {
    const usuario = await Usuario.findOne({ user });

    if (!usuario) {
      return res.status(400).json({
        ok: false,
        msg: "Usuario no encontrado",
      });
    }

    tipoUsuario = usuario.tipo_usuario;

    // CONFIRMAR CLAVES
    const validarPassword = bcrypt.compareSync(password, usuario.password); // compara los password, da true o false

    if (!validarPassword || password.length < 6) {
      return res.status(400).json({
        ok: false,
        msg: "Password incorrecto",
      });
    }

    //GENERO JWT
    const token = await generarJWT(usuario.id, usuario.user);
    return res.json({
      ok: true,
      msg: "Accedo a calendario",
      user: {
        id: usuario.id,
        user: usuario.user,
        tipo_usuario: usuario.tipo_usuario, // <- Asegurate de enviarlo
        nombre: usuario.nombre,
        apellido: usuario.apellido,
      },
      token,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Por consulte al administrador",
    });
  }
};
const revalidartoken = async (req, res = response) => {
  const { id, user } = req;

  try {
    const usuario = await Usuario.findById(id);

    const token = await generarJWT(id, user);

    return res.json({
      ok: true,
      user: {
        id: usuario.id,
        user: usuario.user,
        tipo_usuario: usuario.tipo_usuario,
        nombre: usuario.nombre,
      },
      token,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Error al revalidar el token. Hable con el administrador.",
    });
  }
};

/**
 * CREAR NUEVO USUARIO
 */
const crearUsuario = async (req, res = response) => {
  const { nombre, email, password, user } = req.body;

  try {
    console.log({ tipoUsuario });

    let usuario = await Usuario.findOne({ user });

    if (usuario) {
      return res.status(400).json({
        ok: false,
        msg: "Nombre de usuario existente en la base de datos",
        uid: usuario.uid,
        name: usuario.user,
      });
    }
    usuario = new Usuario(req.body);
    //ENCRIPTAR CLAVE
    const salt = bcrypt.genSaltSync();
    usuario.password = bcrypt.hashSync(password, salt);
    await usuario.save();

    // GENERAR JWT
    const token = await generarJWT(usuario.id, usuario.name);
    res.status(201).json({
      ok: true,
      msg: "Usuario creado",
      name: usuario.name,
      email: usuario.email,
      token,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "por favor hable con el administrador",
    });
  }
};
/**
 * BUSCO USUARIOS CON TODOS LOS FILTROS BACKEND
 */
const buscarUsuarios = async (req, res = response) => {
  const { termino } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  try {
    const regex = new RegExp(termino, "i"); // 'i' para que no distinga mayúsculas/minúsculas
    const [usuarios, total] = await Promise.all([
      Usuario.find({
        $or: [{ nombre: regex }, { apellido: regex }, { user: regex }],
      })
        .skip(skip)
        .limit(limit),
      Usuario.countDocuments({
        $or: [{ nombre: regex }, { apellido: regex }, { user: regex }],
      }),
    ]);

    res.json({
      ok: true,
      usuarios,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Usuarios encontrados",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

/**
 * BUSCAR USUARIO - EL FILTRO SE HACE DESDE EL FRONT
 */

const getUsuario = async (req, res = response) => {
  try {
    const usuario = await Usuario.find();

    if (!usuario) {
      return res.status(400).json({
        ok: false,
        msg: "El usuario no existe",
      });
    }

    res.json({
      ok: true,
      usuario,
      msg: "Muestro usuario",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

/**
 * BUSCAR USUARIO POR USER
 */
const getUsuarioPorUser = async (req, res = response) => {
  const { apellido } = req.params;

  try {
    const usuario = await Usuario.find({ apellido });
    if (!usuario) {
      return res.status(400).json({
        ok: false,
        msg: "El usuario no existe",
      });
    }
    return res.status(200).json({
      ok: true,
      usuario,
      msg: "Muestro usuario",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

/**
 * ACTUALIZAR USUARIO
 */

const actualizarUsuario = async (req, res = response) => {
  const { id } = req.params;

  try {
    const usuario = await Usuario.findById(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        msg: "Usuario no encontrado",
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
    // Validar user duplicado (si cambia)
    if (camposActualizados.user && camposActualizados.user !== usuario.user) {
      const userExistente = await Usuario.findOne({
        user: camposActualizados.user,
      });

      if (userExistente && userExistente._id.toString() !== id) {
        return res.status(400).json({
          ok: false,
          msg: "El nombre de usuario ya está registrado por otro usuario",
        });
      }
    }
    // Validar email duplicado (si cambia)
    if (
      camposActualizados.email &&
      camposActualizados.email !== usuario.email
    ) {
      const emailExistente = await Usuario.findOne({
        email: camposActualizados.email,
      });

      if (emailExistente && emailExistente._id.toString() !== id) {
        return res.status(400).json({
          ok: false,
          msg: "El email ya está registrado por otro usuario",
        });
      }
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      id,
      camposActualizados,
      {
        new: true,
      }
    );

    return res.json({
      ok: true,
      usuario: usuarioActualizado,
      msg: "Usuario actualizado correctamente",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Error al actualizar. Hable con el administrador.",
    });
  }
};

/**
 * ELIMINAR USUARIO_ID
 */
const eliminarUsuario = async (req, res = response) => {
  const usuarioId = req.params.id;
  console.log("Backend: ", usuarioId);

  try {
    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        msg: "Usuario inexistente",
      });
    }

    await Usuario.findByIdAndDelete(usuarioId);

    res.json({
      ok: true,
      msg: "Usuario Eliminado",
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
  crearUsuario,
  getUsuario,
  getUsuarioPorUser,
  eliminarUsuario,
  actualizarUsuario,
  loginUsuario,
  revalidartoken,
  buscarUsuarios,
};
