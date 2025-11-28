const bcrypt = require("bcryptjs");
const { prisma } = require("../db");
const { generarJWT } = require("../helpers/jwt");
// helper: convierte ''/undefined -> null (para no pisar con cadenas vacías)
const toNull = (v) => (v === "" || v === undefined ? null : v);

let tipoUsuario;

//================================LOGIN====================================
const loginUsuario = async (req, res) => {
  const user = (req.body.user || "").trim();
  const password = req.body.password || "";

  try {
    if (!user || password.length < 6) {
      return res.status(400).json({ ok: false, msg: "Credenciales inválidas" });
    }

    // 1) Buscar por user y estado
    const usuario = await prisma.usuario.findFirst({
      where: { user, estado: "activo" },
    });

    // 2) No existe o está inactivo -> no permitir login
    if (!usuario) {
      return res.status(400).json({ ok: false, msg: "Usuario no encontrado" });
    }
    if (usuario.estado !== "activo") {
      return res.status(403).json({
        ok: false,
        msg: "Usuario inactivo. Contacte al administrador.",
      });
    }

    // 3) Validar password
    const okPass = bcrypt.compareSync(password, usuario.password);
    if (!okPass) {
      return res.status(400).json({ ok: false, msg: "Password incorrecto" });
    }

    // 4) Generar token
    const token = await generarJWT(usuario.id, usuario.user);

    return res.json({
      ok: true,
      msg: "Accedo a calendario",
      user: {
        id: usuario.id,
        user: usuario.user,
        tipo_usuario: usuario.tipo_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
      },
      token,
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Por favor, consulte al administrador" });
  }
};

//----------------------------RENEW-----------------------------
const revalidartoken = async (req, res) => {
  const { id, user } = req; // seteado por validar-jwt
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(id) },
    });
    const token = await generarJWT(id, user);
    return res.json({
      ok: true,
      user: {
        id: usuario.id,
        user: usuario.user,
        tipo_usuario: usuario.tipo_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
      },
      token,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      msg: "Error al revalidar el token. Hable con el administrador.",
    });
  }
};
//=====================================CREAR===========================================
const crearUsuario = async (req, res) => {
  const { nombre, apellido, celular, email, password, user, tipo_usuario } =
    req.body;

  try {
    // Validaciones básicas
    if (!user || !password || !nombre || !apellido || !tipo_usuario) {
      return res.status(400).json({
        ok: false,
        msg: "user, password, nombre, apellido y tipo_usuario son obligatorios",
      });
    }
    if ((password?.length || 0) < 6) {
      return res.status(400).json({
        ok: false,
        msg: "El password debe tener al menos 6 caracteres",
      });
    }

    // user tomado SOLO si hay un ACTIVO
    const userTomado = await prisma.usuario.findFirst({
      where: { user, estado: "activo" },
      select: { id: true, user: true, nombre: true, apellido: true },
    });
    if (userTomado) {
      return res
        .status(400)
        .json({ ok: false, msg: "Nombre de usuario existente (ACTIVO)" });
    }

    if (email) {
      const emailTomado = await prisma.usuario.findFirst({
        where: { email, estado: "activo" },
        select: { id: true, email: true },
      });
      if (emailTomado) {
        return res.status(400).json({
          ok: false,
          msg: "El email ya está registrado por otro usuario ACTIVO",
        });
      }
    }

    // Hash de password
    const salt = bcrypt.genSaltSync();
    const passwordHash = bcrypt.hashSync(password, salt);

    const actorId = req.uid ?? null; // quien hace el alta (si hay JWT)
    const actorStr = req.userName ?? null; // nombre del actor (opcional)

    let nuevo;
    await prisma.$transaction(async (tx) => {
      // 1) crear Usuario (estado activo por defecto)
      nuevo = await tx.usuario.create({
        data: {
          user,
          password: passwordHash,
          nombre,
          apellido,
          celular: celular || null,
          email: email || null,
          tipo_usuario,
          estado: "activo",
        },
      });

      // 2) snapshot histórico (versión 1)
      await tx.usuarioHist.create({
        data: {
          usuarioId: nuevo.id, // target
          version: 1,
          accion: "CREAR",
          actorId: actorId ? Number(actorId) : null,
          user: actorStr,
          userLogin: nuevo.user, // snapshot del username del usuario creado
          nombre: nuevo.nombre,
          apellido: nuevo.apellido,
          celular: nuevo.celular,
          email: nuevo.email,
          tipo_usuario: nuevo.tipo_usuario,
          estado: nuevo.estado, // 'activo'
        },
      });
    });

    const token = await generarJWT(nuevo.id, nuevo.user);

    return res.status(201).json({
      ok: true,
      msg: "Usuario creado",
      name: nuevo.nombre,
      email: nuevo.email,
      token,
    });
  } catch (e) {
  console.error(e);

  if (e.code === "P2002") {
    return res
      .status(400)
      .json({ ok: false, msg: "Usuario o email duplicado" });
  }

  return res.status(500).json({
    ok: false,
    msg: e.message || "Error inesperado en crearUsuario",
  });
}
  
};
//======================================BUSCAR_USUARIO============================================
const buscarUsuarios = async (req, res) => {
  const { termino } = req.params;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "5", 10), 1),
    100
  );
  const skip = (page - 1) * limit;

  try {
    const q = termino?.trim().toLowerCase();
    // siempre filtramos por activos
    const baseWhere = { estado: "activo" };

    const where = q
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { user: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : baseWhere;

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      }),
      prisma.usuario.count({ where }),
    ]);

    res.json({
      ok: true,
      usuarios,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Usuarios encontrados",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
  }
};
//----------------------------GET_TODOS-----------------------------
const getUsuario = async (_req, res) => {
  try {
    const usuario = await prisma.usuario.findMany({
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    });
    res.json({ ok: true, usuario, msg: "Muestro usuario" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
  }
};
//----------------------------GET_POR_APELLIDO-----------------------------
const getUsuarioPorUser = async (req, res) => {
  const { apellido } = req.params;
  try {
    const usuario = await prisma.usuario.findMany({ where: { apellido } });
    if (!usuario || usuario.length === 0) {
      return res.status(400).json({ ok: false, msg: "El usuario no existe" });
    }
    return res.status(200).json({ ok: true, usuario, msg: "Muestro usuario" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
  }
};
//==============================ACTUALIZAR===========================================
async function actualizarUsuario(req, res) {
  try {
    const id = Number(req.params.id);
    const {
      user, // NO permitimos cambiarlo
      password, // opcional
      nombre,
      apellido,
      celular,
      email,
      tipo_usuario, // opcional
      estado, // opcional (si no querés permitirlo, quita esta línea del update)
    } = req.body || {};

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    }

    // bloquear cambio de user
    if (user && user !== usuario.user) {
      return res.status(400).json({
        ok: false,
        msg: 'Cambio de "user" deshabilitado. Cree un usuario nuevo.',
      });
    }
    // validar email si cambia
    if (email && email !== usuario.email) {
      const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regexEmail.test(email)) {
        return res.status(400).json({ ok: false, msg: "Email inválido" });
      }
      const emailTomado = await prisma.usuario.findFirst({
        where: { email, estado: "activo", NOT: { id } }, // <-- solo activos, excluyendo el mismo id
        select: { id: true },
      });
      if (emailTomado) {
        return res.status(400).json({
          ok: false,
          msg: "El email ya está registrado por otro usuario ACTIVO",
        });
      }
    }

    // password opcional
    let passwordHash;
    if (password !== undefined) {
      if ((password?.length || 0) < 6) {
        return res.status(400).json({
          ok: false,
          msg: "El password debe tener al menos 6 caracteres",
        });
      }
      const salt = bcrypt.genSaltSync();
      passwordHash = bcrypt.hashSync(password, salt);
    }

    const actorId = req.uid ?? null;
    const actorStr = req.userName ?? null;

    let actualizado;

    await prisma.$transaction(async (tx) => {
      // UPDATE
      actualizado = await tx.usuario.update({
        where: { id },
        data: {
          // user: no se toca
          password: passwordHash ?? undefined,
          nombre: nombre ?? undefined,
          apellido: apellido ?? undefined,
          celular: toNull(celular) ?? undefined,
          email: toNull(email) ?? undefined,
          tipo_usuario: tipo_usuario ?? undefined,
          estado: estado ?? undefined, // quita si NO querés permitir cambiar estado aquí
        },
      });

      // versión siguiente
      const prev = await tx.usuarioHist.count({ where: { usuarioId: id } });
      const nextVersion = prev + 1;

      // snapshot histórico
      await tx.usuarioHist.create({
        data: {
          usuarioId: id,
          version: nextVersion,
          accion: "ACTUALIZAR",
          actorId: actorId ? Number(actorId) : null,
          user: actorStr, // actor (string)
          userLogin: actualizado.user, // username del usuario actualizado
          nombre: actualizado.nombre,
          apellido: actualizado.apellido,
          celular: actualizado.celular,
          email: actualizado.email,
          tipo_usuario: actualizado.tipo_usuario,
          estado: actualizado.estado,
          // changedAt lo setea @default(now())
        },
      });
    }); // ← cierra la transacción

    return res.json({
      ok: true,
      msg: "Usuario actualizado correctamente",
      usuario: {
        id: actualizado.id,
        user: actualizado.user,
        nombre: actualizado.nombre,
        apellido: actualizado.apellido,
        celular: actualizado.celular,
        email: actualizado.email,
        tipo_usuario: actualizado.tipo_usuario,
        estado: actualizado.estado,
        createdAt: actualizado.createdAt,
        updatedAt: actualizado.updatedAt,
      },
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res
        .status(400)
        .json({ ok: false, msg: "Usuario o email duplicado" });
    }
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//============================================ELIMINAR=================================
const eliminarUsuario = async (req, res) => {
  const id = Number(req.params.id);
  try {
    // (opcional) evitar que un usuario se desactive a sí mismo
    if (req.uid && Number(req.uid) === id) {
      return res
        .status(400)
        .json({ ok: false, msg: "No podés inactivar tu propio usuario." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: id } });
    if (!usuario)
      return res.status(404).json({ ok: false, msg: "Usuario inexistente" });

    // si ya estaba inactivo, devolvemos OK (no rompemos el front)
    if (usuario.estado === "inactivo") {
      return res.json({ ok: true, msg: "Usuario inactivado" });
    }

    const actorId = req.uid ?? null; // quién ejecuta la acción (JWT)
    const actorStr = req.userName ?? null; // nombre del actor (si lo guardás)

    await prisma.$transaction(async (tx) => {
      // 1) marcar inactivo
      const inactivado = await tx.usuario.update({
        where: { id },
        data: { estado: "inactivo" },
      });

      // 2) siguiente versión del histórico
      const nextVersion =
        (await tx.usuarioHist.count({ where: { usuarioId: id } })) + 1;

      // 3) snapshot en histórico
      await tx.usuarioHist.create({
        data: {
          usuarioId: id,
          version: nextVersion,
          accion: "INACTIVAR",
          actorId: actorId ? Number(actorId) : null,
          user: actorStr, // actor (string)
          userLogin: inactivado.user, // snapshot del username del usuario inactivado
          nombre: inactivado.nombre,
          apellido: inactivado.apellido,
          celular: inactivado.celular,
          email: inactivado.email,
          tipo_usuario: inactivado.tipo_usuario,
          estado: inactivado.estado, // 'inactivo'
          // changedAt lo setea @default(now())
        },
      });
    });

    return res.json({ ok: true, msg: "Usuario eliminado" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: "Consulte con el administrador" });
  }
};

module.exports = {
  loginUsuario,
  revalidartoken,
  crearUsuario,
  buscarUsuarios,
  getUsuario,
  getUsuarioPorUser,
  actualizarUsuario,
  eliminarUsuario,
};
