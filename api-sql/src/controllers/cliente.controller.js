const { prisma } = require("../db");
const { contarReservasCliente } = require("../helpers/contarReservasCliente");

// Normalizadores
const toStr = (v) => (v === null || v === undefined ? null : String(v).trim());
const toLower = (v) => {
  const s = toStr(v);
  return s ? s.toLowerCase() : null;
};

// Unifica telefono/celular
const norm = (obj = {}) => {
  const telRaw = obj.telefono ?? obj.celular ?? null;
  const telStr = toStr(telRaw);
  return {
    ...obj,
    dni: toStr(obj.dni),
    nombre: toStr(obj.nombre),
    apellido: toStr(obj.apellido),
    telefono: telStr === "" ? null : telStr,
    email: toLower(obj.email),
  };
};

///===============================================CREAR_CLIENTE===================================================
async function crearCliente(req, res) {
  try {
    const data = norm(req.body);
    const { dni, nombre, apellido, telefono, email } = data || {};

    if (!dni || !nombre || !apellido) {
      return res
        .status(400)
        .json({ ok: false, msg: "dni, nombre y apellido son obligatorios" });
    }
    if (!/^\d+$/.test(dni)) {
      return res.status(400).json({ ok: false, msg: "DNI debe ser numérico" });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, msg: "Email inválido" });
    }

    // duplicados ->dni ->email
    const dupDni = await prisma.cliente.findFirst({
      where: { dni, estado: "activo" },
      select: { id: true, nombre: true, apellido: true, dni: true },
    });
    if (dupDni) {
      return res.status(400).json({
        ok: false,
        msg: "Dni ingresado esta asociado a otro cliente",
        dni: dupDni.dni,
        nombre: dupDni.nombre,
        apellido: dupDni.apellido,
      });
    }
    if (email) {
      const dupEmail = await prisma.cliente.findFirst({
        where: { email, estado: "activo" },
        select: { email: true, nombre: true, apellido: true },
      });
      if (dupEmail) {
        return res.status(400).json({
          ok: false,
          msg: "Email ingresado esta asociado a otro cliente",
          nombre: dupEmail.nombre,
          apellido: dupEmail.apellido,
          email: dupEmail.email,
        });
      }
    }
    // Validar teléfono ya normalizado (string o null)
    if (telefono && !/^\+?\d{6,15}$/.test(telefono)) {
      return res.status(400).json({
        ok: false,
        msg: "Teléfono inválido (use solo dígitos y opcional +)",
      });
    }

    // actor autenticado (tolerante a ambos nombres por si en otro módulo usaste uid/userName)
    const actorId = req.id ?? req.uid ?? null;
    const actorUser = req.user ?? req.userName ?? null;

    let creado;
    await prisma.$transaction(async (tx) => {
      // 1) Cliente
      creado = await tx.cliente.create({
        data: {
          dni,
          nombre,
          apellido,
          telefono: telefono ?? null,
          email: email || null,
          estado: "activo",
        },
      });

      // 2) Historial (versión = 1)
      await tx.clienteHist.create({
        data: {
          clienteId: creado.id,
          version: 1,
          accion: "CREAR",
          usuarioId: actorId ? Number(actorId) : null,
          user: actorUser, // << usa 'user' (no user2)
          dni: creado.dni,
          nombre: creado.nombre,
          apellido: creado.apellido,
          telefono: creado.telefono,
          email: creado.email,
          estado: creado.estado,
        },
      });
    });

    return res.status(201).json({
      ok: true,
      msg: "Cliente registrado exitosamente",
      cliente: creado,
    });
  } catch (e) {
    if (e.code === "P2002")
      return res
        .status(400)
        .json({ ok: false, msg: "DNI o Email ya registrados" });
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

// ===================================== BUSCAR==========================================================

async function buscarCliente(req, res) {
  const termino = (req.params.termino || "").trim();
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "5", 10), 1),
    100
  );
  const skip = (page - 1) * limit;

  try {
    const q = termino.toLowerCase();
    // siempre filtramos por activos
    const baseWhere = { estado: "activo" };

    // si hay término, sumamos el OR de nombre/apellido/dni
    const where = termino
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { dni: { contains: termino } }, // dni como string
              ],
            },
          ],
        }
      : baseWhere;

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      }),
      prisma.cliente.count({ where }),
    ]);

    return res.json({
      ok: true,

      clientes,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Clientes encontrados",
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
// ================================ GET TODOS =======================================================
async function getCliente(_req, res) {
  try {
    const clientes = await prisma.cliente.findMany({
      where: { estado: "activo" }, // <- filtro
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    });

    return res.json({ ok: true, clientes, msg: "Traigo clientes ACTIVOS" });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

// ===================================== GET POR APELLIDO =========================================
async function getClientePorApellido(req, res) {
  const { apellido } = req.params;
  try {
    const cliente = await prisma.cliente.findMany({ where: { apellido } });
    if (!cliente || cliente.length === 0) {
      return res
        .status(400)
        .json({ ok: false, msg: "El cliente no existe en la base de datos" });
    }
    return res
      .status(200)
      .json({ ok: true, cliente, msg: "Traigo todos los clientes" });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
// ================================= ACTUALIZAR ===================================================

async function actualizarCliente(req, res) {
  try {
    const id = Number(req.params.id);
    const { nombre, apellido, telefono, email, dni } = req.body || {};

    // 1) Existe el cliente
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      return res.status(404).json({ ok: false, msg: "Cliente no encontrado" });
    }

    // 2) No permitimos cambiar DNI
    if (dni && dni !== cliente.dni) {
      return res.status(400).json({
        ok: false,
        msg: "Cambio de DNI deshabilitado para evitar inconsistencias con reservas. Cree un cliente nuevo.",
      });
    }

    // 3) Validar email si viene y no es el mismo
    if (email && email !== cliente.email) {
      const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regexEmail.test(email)) {
        return res.status(400).json({ ok: false, msg: "Email inválido" });
      }
      const emailTomado = await prisma.cliente.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (emailTomado) {
        return res.status(400).json({
          ok: false,
          msg: "El email ya está registrado por otro cliente",
        });
      }
    }

    // 4) Normalizo opcionales (vacío -> null) para no pisar con cadenas vacías
    const toNull = (v) => (v === "" || v === undefined ? null : v);

    const actorId = req.id ?? req.uid ?? null;
    const actorUser = req.user ?? req.userName ?? null;

    let actualizado;

    await prisma.$transaction(async (tx) => {
      // 5) Update en Cliente
      actualizado = await tx.cliente.update({
        where: { id },
        data: {
          nombre: nombre ?? undefined,
          apellido: apellido ?? undefined,
          telefono: toNull(telefono) ?? undefined,
          email: toNull(email) ?? undefined,
          // estado:  'activo' | 'inactivo' (no lo tocamos acá)
        },
      });

      // 6) Calcular siguiente versión de histórico
      const prev = await tx.clienteHist.count({ where: { clienteId: id } });
      const nextVersion = prev + 1;

      // 7) Snapshot en ClienteHist
      await tx.clienteHist.create({
        data: {
          clienteId: id,
          version: nextVersion,
          accion: "ACTUALIZAR",
          usuarioId: actorId ? Number(actorId) : null,
          user: actorUser,
          dni: actualizado.dni,
          nombre: actualizado.nombre,
          apellido: actualizado.apellido,
          telefono: actualizado.telefono,
          email: actualizado.email,
          estado: actualizado.estado, // se guarda el estado actual del cliente
          // changedAt lo completa Prisma con @default(now())
        },
      });
    });

    return res.json({
      ok: true,
      msg: "Cliente actualizado correctamente",
      cliente: actualizado,
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res
        .status(400)
        .json({ ok: false, msg: "DNI o Email ya registrados" });
    }
    console.error(e);
    return res.status(500).json({
      ok: false,
      msg: "Error al actualizar. Hable con el administrador.",
    });
  }
}

// ======================================== ELIMINAR =====================================================

async function eliminarCliente(req, res) {
  const id = Number(req.params.id);

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      return res.status(404).json({ ok: false, msg: "Cliente inexistente" });
    }

    //Bloqueo si tiene reservas asociadas (por defecto: activas)
    const reservasAsociadas = await contarReservasCliente(id, true);
    if (reservasAsociadas > 0) {
      return res.status(400).json({
        ok: false,
        msg: "No se puede eliminar el cliente porque tiene reservas asociadas.",
      });
    }

    // Si ya está inactivo, mantenemos el mismo mensaje que tu V1
    if (cliente.estado === "inactivo") {
      return res.json({ ok: true, msg: "Cliente Eliminado" });
    }

    const actorId = req.id ?? req.uid ?? null;
    const actorUser = req.user ?? req.userName ?? null;

    await prisma.$transaction(async (tx) => {
      // 1) marcar inactivo
      const inactivado = await tx.cliente.update({
        where: { id },
        data: { estado: "inactivo" },
      });

      // 2) versión siguiente del histórico
      const nextVersion =
        (await tx.clienteHist.count({ where: { clienteId: id } })) + 1;

      // 3) snapshot en ClienteHist
      await tx.clienteHist.create({
        data: {
          clienteId: id,
          version: nextVersion,
          accion: "INACTIVAR", // (usa 'ELIMINAR' si preferís)
          usuarioId: actorId ? Number(actorId) : null,
          user: actorUser,
          dni: inactivado.dni,
          nombre: inactivado.nombre,
          apellido: inactivado.apellido,
          telefono: inactivado.telefono,
          email: inactivado.email,
          estado: inactivado.estado, // 'inactivo'
          // changedAt lo completa Prisma por @default(now())
        },
      });
    });

    // mismo texto que tu backend anterior para no romper el front
    return res.json({ ok: true, msg: "Cliente Eliminado" });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

module.exports = {
  crearCliente,
  buscarCliente,
  getCliente,
  getClientePorApellido,
  actualizarCliente,
  eliminarCliente,
};
