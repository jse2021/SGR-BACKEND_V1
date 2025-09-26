const { prisma } = require('../db');

// Utilidad: números seguros
const toNumberOrNull = (v) => (v === undefined || v === null ? null : Number(v));


//==========================================CREAR_MONTO_CANCHA========================================
async function crearMontoCancha(req, res) {
  try {
    const { nombre, monto_cancha, monto_sena } = req.body;

    // 1) Existe la cancha por nombre?
    const cancha = await prisma.cancha.findUnique({ where: { nombre } });
    if (!cancha) {
      return res.status(400).json({ ok: false, msg: 'Cancha no existe' });
    }

    // 2) Ya tiene configuración? (bloquear como en Mongo)
    const existente = await prisma.configuracion.findUnique({ where: { canchaId: cancha.id } });
    if (existente) {
      return res.status(400).json({
        ok: false,
        msg: 'Cancha existente. Si desea realizar cambios en la cancha debe actualizar la misma',
      });
    }

    const actorId  = req.uid ?? null;      // quién hace el cambio (JWT)
    const actorStr = req.userName ?? null; // nombre del actor si lo guardás

    // 3) Crear + histórico (versión 1)
    await prisma.$transaction(async (tx) => {
      const conf = await tx.configuracion.create({
        data: {
          canchaId: cancha.id,
          monto_cancha: toNumberOrNull(monto_cancha) ?? 0,
          monto_sena:   toNumberOrNull(monto_sena)   ?? 0,
        },
      });

      await tx.configuracionHist.create({
        data: {
          configuracionId: conf.id,
          canchaId: cancha.id,
          version: 1,
          accion: 'CREAR',
          usuarioId: actorId ? Number(actorId) : null,
          user: actorStr,
          monto_cancha: conf.monto_cancha,
          monto_sena:   conf.monto_sena,
        },
      });
    });

    return res.status(200).json({ ok: true, msg: 'Configuración creada correctamente' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//=========================================GET_MONTO_CANCHA_POR_NOMBRE====================================
async function getMontoCanchas(req, res) {
  const { nombre } = req.params;
  try {
    const cancha = await prisma.cancha.findUnique({ where: { nombre } });
    if (!cancha) {
      return res.status(400).json({ ok: false, msg: 'No existen configuraciones para esta cancha' });
    }

    const conf = await prisma.configuracion.findUnique({ where: { canchaId: cancha.id } });
    if (!conf) {
      return res.status(400).json({ ok: false, msg: 'No existen configuraciones' });
    }

    const canchasMonto = {
      id: conf.id,
      nombre,
      monto_cancha: Number(conf.monto_cancha),
      monto_sena:   Number(conf.monto_sena),
    };

    return res.json({ ok: true, canchasMonto, msg: 'Listado de configuraciones' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//==========================================TRAIGO_TODAS_LAS_CONF_X_ID======================================
async function getMontoCanchaId(req, res) {
  const { idCancha } = req.params;
  try {
    const cancha = await prisma.cancha.findUnique({ where: { id: Number(idCancha) } });
    if (!cancha) {
      return res.status(404).json({ ok: false, msg: 'Cancha no encontrada' });
    }

    const conf = await prisma.configuracion.findUnique({ where: { canchaId: cancha.id } });
    if (!conf) {
      return res.status(404).json({ ok: false, msg: 'No existen configuraciones para esta cancha' });
    }

    const canchasMonto = {
      id: conf.id,
      nombre: cancha.nombre,
      monto_cancha: Number(conf.monto_cancha),
      monto_sena:   Number(conf.monto_sena),
    };

    return res.status(200).json({ ok: true, canchasMonto, msg: 'Configuración encontrada' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//=============================================LISTA_TODAS_CONF========================================
async function getCanchasPrecio(_req, res) {
  try {
    const confs = await prisma.configuracion.findMany({
      include: { cancha: { select: { nombre: true } } },
      orderBy: { id: 'asc' },
    });

    if (!confs || confs.length === 0) {
      return res.status(400).json({ ok: false, msg: 'No existen configuraciones' });
    }

    const canchasPrecio = confs.map((c) => ({
      id: c.id,
      nombre: c.cancha?.nombre || '',
      precio_cancha: Number(c.monto_cancha),
      precio_sena:   Number(c.monto_sena),
    }));

    return res.json({ ok: true, canchasPrecio, msg: 'Listado de configuraciones' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//=====================================ACTUALIZO_MONTO_CANCHA=========================================
async function actualizarMontoCancha(req, res) {
  const { nombre } = req.params;
  try {
    const cancha = await prisma.cancha.findUnique({ where: { nombre } });
    if (!cancha) {
      return res.status(400).json({ ok: false, msg: 'La cancha no existe en la base de datos' });
    }

    const conf = await prisma.configuracion.findUnique({ where: { canchaId: cancha.id } });
    if (!conf) {
      return res.status(400).json({ ok: false, msg: 'La cancha no tiene configuración' });
    }

 // armamos el patch (solo lo que venga)
    const patch = {};
    if (req.body.monto_cancha !== undefined) patch.monto_cancha = Number(req.body.monto_cancha);
    if (req.body.monto_sena   !== undefined) patch.monto_sena   = Number(req.body.monto_sena);

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, msg: 'No hay cambios para aplicar' });
    }

    const actorId  = req.uid ?? null;
    const actorStr = req.userName ?? null;

    let after;
    await prisma.$transaction(async (tx) => {
      // 1) update
      after = await tx.configuracion.update({
        where: { canchaId: cancha.id },
        data: patch,
      });
      // 2) next version para este configuracionId
      const prev = await tx.configuracionHist.count({ where: { configuracionId: conf.id } });
      const nextVersion = prev + 1;

      // 3) snapshot (guardamos los valores NUEVOS)
      await tx.configuracionHist.create({
        data: {
          configuracionId: conf.id,
          canchaId: cancha.id,
          version: nextVersion,
          accion: 'ACTUALIZAR',
          usuarioId: actorId ? Number(actorId) : null,
          user: actorStr,
          monto_cancha: after.monto_cancha,
          monto_sena:   after.monto_sena,
        },
      });
    });

    return res.json({
      ok: true,
      canchaNombre: { nombre, ...patch },
      msg: 'Montos actualizados correctamente',
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
module.exports = {
  crearMontoCancha,
  getMontoCanchas,
  getMontoCanchaId,
  getCanchasPrecio,
  actualizarMontoCancha,
};