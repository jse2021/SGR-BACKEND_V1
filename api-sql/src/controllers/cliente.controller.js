const { prisma } = require('../db');


// Normaliza strings (trim y email en minúsculas)
const trim = (s) => (typeof s === 'string' ? s.trim() : s);
const norm = (obj) => obj && ({
  ...obj,
  dni: trim(obj.dni),
  nombre: trim(obj.nombre),
  apellido: trim(obj.apellido),
  telefono: trim(obj.telefono),
  email: trim(obj.email)?.toLowerCase(),
});

///------------------------------CREAR-----------------------------------------------------------------------
async function crearCliente(req, res) {
  try {
    const data = norm(req.body);
    const { dni, nombre, apellido, telefono, email } = data || {};

    if (!dni || !nombre || !apellido) {
      return res.status(400).json({ ok: false, msg: 'dni, nombre y apellido son obligatorios' });
    }
    if (!/^\d+$/.test(dni)) {
      return res.status(400).json({ ok: false, msg: 'DNI debe ser numérico' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, msg: 'Email inválido' });
    }

    // Duplicados (para dar mensajes claros como en Mongo)
    const dupDni = await prisma.cliente.findFirst({ where: { dni }, select: { id: true, nombre: true, apellido: true, dni: true } });
    if (dupDni) {
      return res.status(400).json({
        ok: false,
        msg: 'Dni ingresado esta asociado a otro cliente',
        dni: dupDni.dni, nombre: dupDni.nombre, apellido: dupDni.apellido,
      });
    }
    if (email) {
      const dupEmail = await prisma.cliente.findFirst({ where: { email }, select: { email: true, nombre: true, apellido: true } });
      if (dupEmail) {
        return res.status(400).json({
          ok: false,
          msg: 'Email ingresado esta asociado a otro cliente',
          nombre: dupEmail.nombre, apellido: dupEmail.apellido, email: dupEmail.email,
        });
      }
    }

    await prisma.cliente.create({
      data: { dni, nombre, apellido, telefono: telefono || null, email: email || null },
    });

    return res.status(201).json({
      ok: true,
      msg: 'Cliente registrado exitosamente',
      nombre, apellido,
    });
  } catch (e) {
    // catch de unique (por si dos requests llegan “juntos”)
    if (e.code === 'P2002') {
      return res.status(400).json({ ok: false, msg: 'DNI o Email ya registrados' });
    }
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}

// ------------------------- BUSCAR----------------------------------------------------------
// GET /cliente/buscar/:termino?page=1&limit=5
async function buscarCliente(req, res) {
  const termino = (req.params.termino || '').trim();
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 100);
  const skip = (page - 1) * limit;

  try {
    const q = termino.toLowerCase();
    const where = termino
      ? {
          OR: [
            { nombre:   { contains: q, mode: 'insensitive' } },
            { apellido: { contains: q, mode: 'insensitive' } },
            { dni:      { contains: termino } }, // DNI como string numérica
          ],
        }
      : {};

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        skip, take: limit,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      }),
      prisma.cliente.count({ where }),
    ]);

    return res.json({
      ok: true,
      
      clientes,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: 'Clientes encontrados',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
// ------------------------- GET TODOS ------------------------------------------------------------------
async function getCliente(_req, res) {
  try {
    const clientes = await prisma.cliente.findMany({
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    });
    return res.json({ ok: true, clientes, msg: 'Traigo todos los clientes' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
// ------------------------- GET POR APELLIDO -------------------------
async function getClientePorApellido(req, res) {
  const { apellido } = req.params;
  try {
    const cliente = await prisma.cliente.findMany({ where: { apellido } });
    if (!cliente || cliente.length === 0) {
      return res.status(400).json({ ok: false, msg: 'El cliente no existe en la base de datos' });
    }
    return res.status(200).json({ ok: true, cliente, msg: 'Traigo todos los clientes' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
// ------------------------- ACTUALIZAR -------------------------
async function actualizarCliente(req, res) {
  try {
    const id = Number(req.params.id);
    const data = norm(req.body);

    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });

    // (1) Cambio de DNI -> deshabilitado
    if (data?.dni && data.dni !== cliente.dni) {
      return res.status(400).json({
        ok: false,
        msg: 'Cambio de DNI deshabilitado para evitar inconsistencias con reservas. Cree un cliente nuevo.',
      });
    }

    // (2) Validar email si cambia
    if (data?.email && data.email !== cliente.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return res.status(400).json({ ok: false, msg: 'Email inválido' });
      }
      const emailExistente = await prisma.cliente.findFirst({
        where: { email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (emailExistente) {
        return res.status(400).json({ ok: false, msg: 'El email ya está registrado por otro cliente' });
      }
    }

    const actualizado = await prisma.cliente.update({
      where: { id },
      data: {
        nombre:   data?.nombre   ?? undefined,
        apellido: data?.apellido ?? undefined,
        telefono: data?.telefono ?? undefined,
        email:    data?.email    ?? undefined,
      },
    });

    return res.json({ ok: true, usuario: actualizado, msg: 'Cliente actualizado correctamente' });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({ ok: false, msg: 'DNI o Email ya registrados' });
    }
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error al actualizar. Hable con el administrador.' });
  }
}
// ------------------------- ELIMINAR -------------------------
/**
 * 
 *Implementar la actualizacion, en ves de eliminar 22/08
 */
async function eliminarCliente(req, res) {
  const id = Number(req.params.id);

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      return res.status(404).json({ ok: false, msg: 'Cliente inexistente' });
    }

    // Cuando creemos la tabla Reserva: FK (clienteId) con ON DELETE RESTRICT
    // y/o verificación:
    // if (prisma.reserva) {
    //   const reservasActivas = await prisma.reserva.count({ where: { clienteId: id, estado: 'activo' } });
    //   if (reservasActivas > 0) {
    //     return res.status(400).json({
    //       ok: false,
    //       msg: `No se puede eliminar el cliente porque tiene ${reservasActivas} reservas activas asociadas.`,
    //     });
    //   }
    // }

    await prisma.cliente.delete({ where: { id } });
    return res.json({ ok: true, msg: 'Cliente Eliminado' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}

module.exports = {
    crearCliente,
    buscarCliente,
    getCliente,
    getClientePorApellido,
    actualizarCliente,
    eliminarCliente
}