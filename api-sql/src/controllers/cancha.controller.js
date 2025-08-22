const { prisma } = require('../db');

const trim = (s) => (typeof s === 'string' ? s.trim() : s);


//----------------------------------------------------------Crear_Cancha-------------------------------------------------
async function crearCancha(req, res) {
  try {
    const nombre  = trim(req.body?.nombre);
    const medidas = trim(req.body?.medidas || '');

    if (!nombre) {
      return res.status(400).json({ ok: false, msg: 'El nombre es obligatorio' });
    }

    // ¿ya existe por nombre?
    const existente = await prisma.cancha.findFirst({ where: { nombre } });
    if (existente) {
      return res.status(400).json({
        ok: false,
        msg: 'La cancha existe en la base de datos',
        nombre: existente, 
        nombre: nombre
      });
    }

    await prisma.cancha.create({ data: { nombre, medidas } });

    return res.status(201).json({
      ok: false, 
      msg: 'Cancha registrada exitosamente',
      nombre, medidas
    });
  } catch (error) {
    console.error(error);
    // por si choca unique (nombre)
    if (error.code === 'P2002') {
      return res.status(400).json({ ok: false, msg: 'La cancha existe en la base de datos' });
    }
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//----------------------------------------------------------Buscar_Cancha-------------------------------------------------
// GET /canchas/buscar/:termino?page=&limit=
async function buscarCancha(req, res) {
  const termino = (req.params.termino || '').trim();
  const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 100);
  const skip  = (page - 1) * limit;

  try {
    const where = termino
      ? {
          OR: [
            { nombre:  { contains: termino, mode: 'insensitive' } },
            { medidas: { contains: termino, mode: 'insensitive' } },
          ],
        }
      : {};

    const [canchas, total] = await Promise.all([
      prisma.cancha.findMany({
        where, skip, take: limit,
        orderBy: [{ nombre: 'asc' }]
      }),
      prisma.cancha.count({ where }),
    ]);

    return res.json({
      ok: true,
      canchas,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      msg: 'Canchas encontrados',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//----------------------------------------------------------Actualizar_Cancha-------------------------------------------------
// PUT /canchas/:id
async function actualizarCancha(req, res) {
  const { id } = req.params;
  try {
    const cancha = await prisma.cancha.findUnique({ where: { id: Number(id) } });
    if (!cancha) {
      return res.status(404).json({ ok: false, msg: 'Cancha no encontrado' });
    }

    const data = {};
    if (typeof req.body?.nombre === 'string')  data.nombre  = req.body.nombre.trim();
    if (typeof req.body?.medidas === 'string') data.medidas = req.body.medidas.trim();

   
    const canchaActualizada = await prisma.cancha.update({
      where: { id: Number(id) },
      data
    });

    return res.json({
      ok: true,
      usuario: canchaActualizada, 
      msg: 'Cancha actualizada correctamente',
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ ok: false, msg: 'La cancha existe en la base de datos' });
    }
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Error al actualizar. Hable con el administrador.' });
  }
}
//----------------------------------------------------------Eliminar_Cancha-------------------------------------------------
// DELETE /canchas/:id
/*
*FALTA IMPLEMENTAR LA ACTUALIZCION, NO ELIMINAR. aGREGAR CAMPO ESTADO
*/
async function eliminarCancha(req, res) {
  const canchaId = Number(req.params.id);
  try {
    const cancha = await prisma.cancha.findUnique({ where: { id: canchaId } });
    if (!cancha) {
      return res.status(404).json({ ok: false, msg: 'Cancha inexistente' });
    }

    // Si más adelante agregamos tabla Configuracion, acá podrías borrar lo relacionado.
    // En este SQL nuevo no la tenemos, así que sólo eliminamos la cancha.
    await prisma.cancha.delete({ where: { id: canchaId } });

    return res.json({ ok: true, msg: `la cancha ${cancha.nombre} fue eliminada` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//----------------------------------------------------------BUSCAR_TODAS_LAS_CANCHAS-------------------------------------------------
// GET /canchas
async function getCancha(_req, res) {
  try {
    const canchas = await prisma.cancha.findMany({ orderBy: [{ nombre: 'asc' }] });
    return res.json({
      ok: true,
      canchas: canchas.map((c) => ({ id: c.id, nombre: c.nombre, medidas: c.medidas })),
      msg: 'Traigo todas las canchas',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
  }
}
//----------------------------------------------------------Buscar_Cancha_POR_NOMBRE-------------------------------------------------
// GET /canchas/nombre/:nombre
async function getCanchaPorNombre(req, res) {
  const { nombre } = req.params;
  try {
    const cancha = await prisma.cancha.findMany({ where: { nombre } });
    if (!cancha || cancha.length === 0) {
      return res.status(400).json({ ok: false, msg: 'La cancha no existe en la base de datos' });
    }
    return res.status(200).json({ ok: true, cancha, msg: 'Traigo cancha' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, msg: 'Consulte con el administrador' });
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
