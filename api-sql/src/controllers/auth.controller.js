const bcrypt = require('bcryptjs');
const { prisma } = require('../db');
const { generarJWT } = require('../helpers/jwt');

let tipoUsuario;

//----------------------------LOGIN-----------------------------
const loginUsuario = async (req, res) => {
  const { user, password } = req.body;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { user } });
    if (!usuario) {
      return res.status(400).json({ ok: false, msg: 'Usuario no encontrado' });
    }
     tipoUsuario = usuario.tipo_usuario;

    const okPass = bcrypt.compareSync(password, usuario.password);
    if (!okPass || (password?.length || 0) < 6) {
      return res.status(400).json({ ok: false, msg: 'Password incorrecto' });
    }

    const token = await generarJWT(usuario.id, usuario.user);
    return res.json({
      ok: true,
      msg: 'Accedo a calendario',
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
    return res.status(500).json({ ok: false, msg: 'Por consulte al administrador' });
  }
};
//----------------------------RENEW-----------------------------
const revalidartoken = async (req, res) => {
  const { id, user } = req; // seteado por validar-jwt
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
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
    return res.status(500).json({ ok: false, msg: 'Error al revalidar el token. Hable con el administrador.' });
  }
};
//----------------------------CREAR-----------------------------
const crearUsuario = async (req, res) => {
  const { nombre, apellido, celular, email, password, user, tipo_usuario } = req.body;

  try {
    const existente = await prisma.usuario.findUnique({ where: { user } });
    if (existente) {
      return res.status(400).json({
        ok: false,
        msg: 'Nombre de usuario existente en la base de datos',
        uid: existente.id,
        name: existente.user,
        nombre: existente.nombre,
        apellido: existente.apellido
      });
    }

    if (email) {
      const e = await prisma.usuario.findFirst({ where: { email } });
      if (e) return res.status(400).json({ 
        ok: false, msg: 'El email ya está registrado por otro usuario',
        
       });
    }

    const salt = bcrypt.genSaltSync();
    const passwordHash = bcrypt.hashSync(password, salt);

    const usuario = await prisma.usuario.create({
      data: { nombre, apellido, celular, email: email || null, user, password: passwordHash, tipo_usuario },
    });

    const token = await generarJWT(usuario.id, usuario.user);

    return res.status(201).json({
      ok: true,
      msg: 'Usuario creado',
      name: usuario.nombre,
      email: usuario.email,
      token,
    });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ ok: false, msg: 'Usuario o email duplicado' });
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'por favor hable con el administrador' });
  }
};
//----------------------------BUSCAR_USUARIO-----------------------------
const buscarUsuarios = async (req, res) => {
  const { termino } = req.params;
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 100);
  const skip = (page - 1) * limit;

  try {
    const q = termino?.trim();
    const where = q
      ? {
          OR: [
            { nombre:   { contains: q, mode: 'insensitive' } },
            { apellido: { contains: q, mode: 'insensitive' } },
            { user:     { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({ where, skip, take: limit, orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] }),
      prisma.usuario.count({ where }),
    ]);

    res.json({
      ok: true,
      usuarios,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: 'Usuarios encontrados',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
};
//----------------------------GET_TODOS-----------------------------
const getUsuario = async (_req, res) => {
  try {
    const usuario = await prisma.usuario.findMany({ orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] });
    res.json({ ok: true, usuario, msg: 'Muestro usuario' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
};
//----------------------------GET_POR_APELLIDO-----------------------------
const getUsuarioPorUser = async (req, res) => {
  const { apellido } = req.params;
  try {
    const usuario = await prisma.usuario.findMany({ where: { apellido } });
    if (!usuario || usuario.length === 0) {
      return res.status(400).json({ ok: false, msg: 'El usuario no existe' });
    }
    return res.status(200).json({ ok: true, usuario, msg: 'Muestro usuario' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
};
//----------------------------ACTUALIZAR-----------------------------
const actualizarUsuario = async (req, res) => {
  const { id } = req.params;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
    if (!usuario) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });

    const campos = { ...req.body };

    // Si viene password nueva, encriptar
    if (campos.password) {
      const salt = bcrypt.genSaltSync();
      campos.password = bcrypt.hashSync(campos.password, salt);
    }

    // Validar user duplicado (si cambia)
    if (campos.user && campos.user !== usuario.user) {
      const existUser = await prisma.usuario.findUnique({ where: { user: campos.user } });
      if (existUser && existUser.id !== usuario.id) {
        return res.status(400).json({ ok: false, msg: 'El nombre de usuario ya está registrado por otro usuario',
            nombre:existUser.nombre,
            apellido:existUser.apellido });
      }
    }

    // Validar email duplicado (si cambia)
    if (campos.email && campos.email !== usuario.email) {
      const existEmail = await prisma.usuario.findFirst({ where: { email: campos.email } });
      if (existEmail && existEmail.id !== usuario.id) {
        return res.status(400).json({ ok: false, msg: 'El email ya está registrado por otro usuario',
            nombre:existEmail.nombre,
            apellido:existEmail.apellido 
         });
      }
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        user:         campos.user         ?? undefined,
        nombre:       campos.nombre       ?? undefined,
        apellido:     campos.apellido     ?? undefined,
        celular:      campos.celular      ?? undefined,
        email:        campos.email        ?? undefined,
        tipo_usuario: campos.tipo_usuario ?? undefined,
        password:     campos.password     ?? undefined,
      },
    });

    return res.json({ ok: true, usuario: usuarioActualizado, msg: 'Usuario actualizado correctamente' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ ok: false, msg: 'Usuario o email ya registrados' });
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error al actualizar. Hable con el administrador.' });
  }
};
//----------------------------ELIMINAR-----------------------------
const eliminarUsuario = async (req, res) => {
  const usuarioId = Number(req.params.id);
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) return res.status(404).json({ ok: false, msg: 'Usuario inexistente' });

    await prisma.usuario.delete({ where: { id: usuarioId } });
    res.json({ ok: true, msg: 'Usuario Eliminado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
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
  eliminarUsuario
};