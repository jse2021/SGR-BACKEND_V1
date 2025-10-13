const { prisma } = require("../db");

const trim = (s) => (typeof s === "string" ? s.trim() : s);
const toNull = (v) => (v === "" || v === undefined ? null : v);

//================================================Crear_Cancha======================================
async function crearCancha(req, res) {
  try {
    const { nombre, medidas } = req.body || {};
    if (!nombre || !nombre.trim()) {
      return res
        .status(400)
        .json({ ok: false, msg: "El Nombre de la cancha es obligatorio" });
    }

    //duplicado SOLO entre ACTIVAS
    const existeActiva = await prisma.cancha.findFirst({
      where: { nombre, estado: "activo" },
      select: { id: true },
    });
    if (existeActiva) {
      return res
        .status(400)
        .json({ ok: false, msg: "Ya existe una cancha ACTIVA con ese nombre" });
    }

    const actorId = req.uid ?? null;
    const actorStr = req.userName ?? null;

    let nueva;
    await prisma.$transaction(async (tx) => {
      nueva = await tx.cancha.create({
        data: {
          nombre: nombre.trim(),
          medidas: toNull(medidas),
          estado: "activo",
        },
      });

      // Histórico versión 1 (CREAR)
      await tx.canchaHist.create({
        data: {
          canchaId: nueva.id,
          version: 1,
          accion: "CREAR",
          usuarioId: actorId ? Number(actorId) : null,
          user: actorStr,
          nombre: nueva.nombre,
          medidas: nueva.medidas,
          estado: nueva.estado,
        },
      });
    });

    return res
      .status(201)
      .json({ ok: true, msg: "Cancha creada", cancha: nueva });
  } catch (e) {
    if (e.code === "P2002")
      return res
        .status(400)
        .json({ ok: false, msg: "Nombre de cancha duplicado" });
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

//----------------------------------------------------------Actualizar_Cancha-------------------------------------------------
// PUT /canchas/:id
async function actualizarCancha(req, res) {
  try {
    const id = Number(req.params.id);
    const { nombre, medidas, estado } = req.body || {};

    const actual = await prisma.cancha.findUnique({ where: { id } });
    if (!actual)
      return res.status(404).json({ ok: false, msg: "Cancha inexistente" });

    // Si cambia el nombre, validá que no exista OTRA ACTIVA con ese nombre
    if (nombre && nombre.trim() && nombre.trim() !== actual.nombre) {
      const ocupa = await prisma.cancha.findFirst({
        where: { nombre: nombre.trim(), estado: "activo", NOT: { id } },
        select: { id: true },
      });
      if (ocupa) {
        return res.status(400).json({
          ok: false,
          msg: "Ya existe otra cancha ACTIVA con ese nombre",
        });
      }
    }

    const actorId = req.uid ?? null;
    const actorStr = req.userName ?? null;

    let actualizada;
    await prisma.$transaction(async (tx) => {
      actualizada = await tx.cancha.update({
        where: { id },
        data: {
          nombre: nombre ?? undefined,
          medidas: toNull(medidas) ?? undefined,
          // estado: estado ?? undefined, // si no querés permitirlo, quitá esta línea
        },
      });

      const prev = await tx.canchaHist.count({ where: { canchaId: id } });
      const nextVersion = prev + 1;

      await tx.canchaHist.create({
        data: {
          canchaId: id,
          version: nextVersion,
          accion: "ACTUALIZAR",
          usuarioId: actorId ? Number(actorId) : null,
          user: actorStr,
          nombre: actualizada.nombre,
          medidas: actualizada.medidas,
          estado: actualizada.estado,
        },
      });
    });

    return res.json({
      ok: true,
      msg: "Cancha actualizada",
      cancha: actualizada,
    });
  } catch (e) {
    if (e.code === "P2002")
      return res
        .status(400)
        .json({ ok: false, msg: "Nombre de cancha duplicado" });
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//====================================================Buscar_Cancha====================================================
// GET /canchas/buscar/:termino?page=&limit=
async function buscarCancha(req, res) {
  const termino = (req.params.termino || "").trim();
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "5", 10), 1),
    100
  );
  const skip = (page - 1) * limit;

  try {
    // siempre filtramos por activos
    const baseWhere = { estado: "activo" };
    const where = termino.toLowerCase()
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { nombre: { contains: termino, mode: "insensitive" } },
                { medidas: { contains: termino, mode: "insensitive" } },
              ],
            },
          ],
        }
      : baseWhere;

    const [canchas, total] = await Promise.all([
      prisma.cancha.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nombre: "asc" }],
      }),
      prisma.cancha.count({ where }),
    ]);

    return res.json({
      ok: true,
      canchas,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: "Canchas encontrados",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}
//====================================================Eliminar_Cancha===================================================
// DELETE /cancha/:id  (soft delete + histórico INACTIVAR)
async function eliminarCancha(req, res) {
  try {
    const id = Number(req.params.id);

    const cancha = await prisma.cancha.findUnique({ where: { id } });
    if (!cancha) {
      return res.status(404).json({ ok: false, msg: "Cancha inexistente" });
    }

    // (Opcional) bloquear si tiene reservas activas
    const activas = await prisma.reserva.count({
      where: { canchaId: id, estado: "activo" },
    });
    if (activas > 0) {
      return res
        .status(400)
        .json({ ok: false, msg: "No se puede eliminar: hay reservas activas" });
    }

    // Si ya estaba inactiva, no duplicamos histórico
    if (cancha.estado === "inactivo") {
      return res.json({ ok: true, msg: "Cancha ya estaba inactiva" });
    }

    const actorId = req.id ?? null; // quien ejecuta (JWT)
    const actorStr = req.user ?? null; // nombre del actor (si lo guardás)

    await prisma.$transaction(async (tx) => {
      // 1) Marcar inactiva
      const inact = await tx.cancha.update({
        where: { id },
        data: { estado: "inactivo" },
      });

      // 2) Próxima versión del histórico
      const nextVersion =
        (await tx.canchaHist.count({ where: { canchaId: id } })) + 1;

      // 3) Snapshot en histórico
      await tx.canchaHist.create({
        data: {
          canchaId: id,
          version: nextVersion,
          accion: "INACTIVAR",
          usuarioId: actorId ? Number(actorId) : null,
          user: actorStr,
          nombre: inact.nombre,
          medidas: inact.medidas,
          estado: inact.estado, // 'inactivo'
        },
      });
    });

    return res.json({ ok: true, msg: "Cancha eliminada" });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

//----------------------------------------------------------BUSCAR_TODAS_LAS_CANCHAS-------------------------------------------------
// GET /canchas
// GET /canchas  -> solo ACTIVAS
async function getCancha(_req, res) {
  try {
    const canchas = await prisma.cancha.findMany({
      where: { estado: "activo" },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, nombre: true, medidas: true },
    });

    return res.json({
      ok: true,
      canchas,
      msg: "Traigo canchas ACTIVAS",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

//----------------------------------------------------------Buscar_Cancha_POR_NOMBRE-------------------------------------------------
// GET /canchas/nombre/:nombre
async function getCanchaPorNombre(req, res) {
  const { nombre } = req.params;
  try {
    const cancha = await prisma.cancha.findMany({ where: { nombre } });
    if (!cancha || cancha.length === 0) {
      return res
        .status(400)
        .json({ ok: false, msg: "La cancha no existe en la base de datos" });
    }
    return res.status(200).json({ ok: true, cancha, msg: "Traigo cancha" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ ok: false, msg: "Consulte con el administrador" });
  }
}

module.exports = {
  crearCancha,
  buscarCancha,
  getCanchaPorNombre,
  getCancha,
  eliminarCancha,
  actualizarCancha,
};
