const { response } = require("express");
const axios = require("axios");
const { body } = require("express-validator");
const Reserva = require("../models/Reserva");
const Cliente = require("../models/Cliente");
const Usuario = require("../models/Usuario");
const Cancha = require("../models/Cancha");
const Configuracion = require("../models/configuracion");
const logger = require("../logs/logger");
const {
  enviarCorreoReserva,
  enviarCorreoReservaActualizada,
  enviarCorreoReservaEliminada,
} = require("../helpers/mailer");
const { Console } = require("winston/lib/winston/transports");

/**
 * CREAR RESERVAS
 */
const crearReserva = async (req, res = response) => {
  try {
    const reserva = new Reserva(req.body);

    const [configuracion, clientes, reservasRegistradas] = await Promise.all([
      Configuracion.find(),
      Cliente.find(),
      Reserva.find(),
    ]);

    const {
      cliente: clienteRequest,
      cancha: canchaRequest,
      estado_pago: estadoPagoRequest,
      fecha: fechaRequest,
      hora: horaRequest,
    } = req.body;
    const uid = req.uid;

    const existeCliente = clientes.find((c) => c.dni === clienteRequest);
    const existeCancha = configuracion.find((c) => c.nombre === canchaRequest);

    if (!existeCliente) {
      return res.status(400).json({ ok: false, msg: "No existe cliente" });
    }

    if (!existeCancha) {
      return res.status(400).json({ ok: false, msg: "No existe cancha" });
    }

    const reservasDelDia = reservasRegistradas.filter(
      (r) =>
        new Date(r.fechaCopia).toISOString().slice(0, 10) ===
          new Date(fechaRequest).toISOString().slice(0, 10) &&
        r.cancha === canchaRequest
    );
    const token = req.header("x-token");

    // LLAMADO INTERNO AL ENDPOINT obtenerMontoPorEstado
    const { data } = await axios.post(
      "http://localhost:4000/api/reserva/obtener-monto",
      {
        cancha: canchaRequest,
        estado_pago: estadoPagoRequest,
      },
      {
        headers: {
          "x-token": token,
        },
      }
    );

    if (!data.ok) {
      return res
        .status(400)
        .json({ ok: false, msg: "Error al obtener el monto" });
    }
    const monto = data.monto;

    // Asignar automáticamente según estado
    reserva.monto_cancha = estadoPagoRequest === "TOTAL" ? monto : 0;
    reserva.monto_sena = estadoPagoRequest === "SEÑA" ? monto : 0;

    const user = await Usuario.findOne({ id: uid });
    reserva.user = user?.user;

    reserva.nombreCliente = existeCliente.nombre;
    reserva.apellidoCliente = existeCliente.apellido;

    reserva.fechaCopia = fechaRequest;
    reserva.title = canchaRequest;
    reserva.start = fechaRequest;
    reserva.end = fechaRequest;

    const guardarReserva = await reserva.save();

    //envio correo electrónico una vez registrada la reserva
    const fechaFormateada = new Date(reserva.fechaCopia).toLocaleDateString(
      "es-AR"
    );
    await enviarCorreoReserva(existeCliente.email, {
      cancha: reserva.cancha,
      fecha: fechaFormateada,
      hora: reserva.hora,
      nombre: `${reserva.nombreCliente} ${reserva.apellidoCliente}`,
      estado: reserva.estado_pago,
      observacion: reserva.observacion,
    });

    return res.status(201).json({
      ok: true,
      msg: "Reserva registrada exitosamente",
      reserva: guardarReserva,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

// para consultar segun fecha, los horarios disponibles de cancha indicada
const obtenerHorasDisponibles = async (req, res = response) => {
  try {
    const { fecha, cancha } = req.body;

    if (!fecha || !cancha) {
      return res.status(400).json({
        ok: false,
        msg: "Faltan datos: fecha y/o cancha",
      });
    }

    // const reservasRegistradas = await Reserva.find({
    //   fechaCopia: fecha,
    //   cancha,
    // }); ANULO, FILTRO POR ESTADO

    /**solo trae reservas activas o sin campo estado */
    const reservasRegistradas = await Reserva.find({
      fechaCopia: fecha,
      cancha,
      $or: [{ estado: "activo" }, { estado: { $exists: false } }],
    });

    const horasOcupadas = reservasRegistradas.map((r) => r.hora);

    const todasLasHoras = [
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
      "23:00",
    ];

    const horasDisponibles = todasLasHoras.filter(
      (h) => !horasOcupadas.includes(h)
    );

    return res.json({
      ok: true,
      horasDisponibles,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Error interno del servidor",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

//**
// ESTA FUNCION PERTENECE A CREAR RESERVAS, PERO SE CREO POR SEPARADO PARA QUE SEA MAS MODULAR Y FACIL MANTENIMIENTO
//LA MISMA BUSCA TRAER DESDE EL BACKEND LOS PRECIOS DE LAS CANCHAS
// LA FUNCIONALIDAD EN EL FRONT END, ES SELECCIONAR UNA CANCHA, ELEGIR EL ESTADO DE PAGO, Y VA CAMBIANDO EL PRECIO EN EL INPUT
// */

const obtenerMontoPorEstado = async (req, res = response) => {
  const { cancha, estado_pago } = req.body;

  try {
    const configuracion = await Configuracion.findOne({ nombre: cancha });

    if (!configuracion) {
      return res.status(404).json({ ok: false, msg: "Cancha no encontrada" });
    }

    let monto = 0;

    if (estado_pago === "TOTAL") {
      monto = configuracion.monto_cancha;
    } else if (estado_pago === "SEÑA") {
      monto = configuracion.monto_sena;
    } else {
      monto = 0;
    }

    return res.json({ ok: true, monto });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ ok: false, msg: "Error interno" });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * CONSULTAR TODAS LAS RESERVAS DEL SISTEMA
 */

const getReserva = async (req, res = response) => {
  const reservas = await Reserva.find();
  try {
    if (!reservas) {
      return res.status(400).json({
        ok: false,
        msg: "No existen reservas",
      });
    }

    return res.status(200).json({
      ok: true,
      reservas,
      msg: "Listar todas las reservas",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Error interno del servidor",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * CONSULTAR RESERVAS POR FECHA. (LO VOY A UTILIZAR PARA LOS REPORTES)
 */

const getReservaFecha = async (req, res = response) => {
  const { fechaCopia } = req.params;
  // const reservasFecha = await Reserva.find({ fechaCopia }); ANULO, SOLO TRAIGO FILTRADO POR ESTADO DE RESERVA

  /**
   * Devuelve solo reservas con estado: "activo"
   * También incluye reservas antiguas que no tienen el campo estado ($exists: false)
   */
  const reservasFecha = await Reserva.find({
    fechaCopia,
    $or: [{ estado: "activo" }, { estado: { $exists: false } }],
  });

  try {
    if (reservasFecha == "") {
      return res.status(400).json({
        ok: false,
        msg: "No existen reservas asociadas a la fecha",
      });
    }
    return res.status(200).json({
      ok: true,
      reservasFecha,
      msg: "Traigo todas las reservas",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * CONSULTAR HORAS DE LA CANCHA. (LO VOY A UTILIZAR PARA LOS REPORTES)
 */
const getCanchaHora = async (req, res = response) => {
  const { fechaCopia, cancha } = req.params;
  const horaCancha = await Reserva.find({ fechaCopia, cancha });

  try {
    if (horaCancha == "") {
      return res.status(400).json({
        ok: false,
        msg: "No existen reservas asociadas a la fecha",
      });
    }
    // Formatea los resultados de la consulta
    const horarios = horaCancha.map((reserva) => {
      return {
        hora: reserva.hora,
      };
    });

    return res.status(200).json({
      ok: true,
      hora: horarios,
      msg: "Traigo todas las reservas",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/*
 *CONSULTAR RESERVAS POR FECHA Y CANCHA
 */
const getReservaFechaCancha = async (req, res = response) => {
  const { fecha, cancha } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const fechaInicio = new Date(fecha);
    fechaInicio.setUTCHours(0, 0, 0, 0);

    const fechaFin = new Date(fecha);
    fechaFin.setUTCHours(23, 59, 59, 999);

    // const filter = {
    //   fecha: {
    //     $gte: fechaInicio,
    //     $lt: fechaFin,
    //   },
    //   cancha,
    // }; ANULADO, AGREGAMOS FILTRO ESTADO
    const filter = {
      fecha: {
        $gte: fechaInicio,
        $lt: fechaFin,
      },
      cancha,
      $or: [{ estado: "activo" }, { estado: { $exists: false } }],
    };

    const total = await Reserva.countDocuments(filter);
    const reservasFecha = await Reserva.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ hora: 1 });

    if (!reservasFecha.length) {
      return res.status(404).json({
        ok: false,
        msg: "No existen reservas asociadas a la fecha",
      });
    }

    return res.status(200).json({
      ok: true,
      reservasFecha,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      msg: "Listado paginado de reservas por fecha y cancha",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * CONSULTAR RESERVA: POR CLIENTE(APELLIDO) EN UN RANGO DE FECHAS
 */
const getReservaClienteRango = async (req, res = response) => {
  const { cliente, fechaIni, fechaFin } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const rangoFechas = {
      $gte: new Date(fechaIni),
      $lte: new Date(fechaFin),
    };

    // const filter = {
    //   cliente,
    //   fecha: rangoFechas,
    // }; ANULO, AGREGO FILTRO ESTADO
    const filter = {
      cliente,
      fecha: rangoFechas,
      $or: [{ estado: "activo" }, { estado: { $exists: false } }],
    };

    const total = await Reserva.countDocuments(filter); // cuenta la cantidad de reservas, sirve para para saber total de paginas a mostrar
    const reservasCliente = await Reserva.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ fecha: -1 });

    return res.status(200).json({
      ok: true,
      reservasCliente,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      msg: "Listado paginado de reservas del cliente",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 *  ACTUALIZAR LAS RESERVAS
 */
const actualizarReserva = async (req, res = response) => {
  const reservaId = req.params.id;
  const fecha_copia = req.body.fecha_copia;

  try {
    if (fecha_copia) {
      return res.status(400).json({
        ok: false,
        msg: "No es posible cambiar la fecha",
      });
    }
    const reserva = await Reserva.findById(reservaId);

    if (!reserva) {
      return res.status(400).json({
        ok: false,
        msg: "La reserva no existe",
      });
    }
    const nuevaReserva = {
      ...req.body,
    };
    //Con este if, soluciono el error de que no actualizaba el monto total de la cancha
    //al no setear nuevamente la cancha
    if (!nuevaReserva.cancha) {
      nuevaReserva.cancha = reserva.cancha;
    }
    const { estado_pago, cancha } = nuevaReserva;

    // Si cambia el estado_pago o la cancha, consultar nuevo monto
    if (estado_pago && cancha) {
      try {
        const token = req.header("x-token");
        const resp = await axios.post(
          "http://localhost:4000/api/reserva/obtener-monto",
          { estado_pago, cancha },
          {
            headers: {
              "x-token": token,
            },
          }
        );
        const monto = resp.data.monto;

        //Aseguramos los campos correctos
        if (estado_pago === "TOTAL") {
          nuevaReserva.monto_cancha = monto;
          nuevaReserva.monto_sena = 0;
        } else if (estado_pago === "SEÑA") {
          nuevaReserva.monto_sena = monto;
          nuevaReserva.monto_cancha = 0;
        } else {
          nuevaReserva.monto_sena = 0;
          nuevaReserva.monto_cancha = 0;
        }
      } catch (error) {
        logger.error(error);
        return res.status(400).json({
          ok: false,
          msg: "Error al actualizar el monto. Verificá que los datos sean correctos.",
        });
      }
    }
    //ACTUALIZAMOS SOLO CAMPOS REALES
    const camposValidos = {
      cliente: nuevaReserva.cliente,
      cancha: nuevaReserva.cancha,
      estado_pago: nuevaReserva.estado_pago,
      monto_cancha: nuevaReserva.monto_cancha,
      monto_sena: nuevaReserva.monto_sena,
      fecha: nuevaReserva.fecha,
      hora: nuevaReserva.hora,
      forma_pago: nuevaReserva.forma_pago,
      observacion: nuevaReserva.observacion,
      title: nuevaReserva.title,
      start: nuevaReserva.start,
      end: nuevaReserva.end,
      user: nuevaReserva.user,
      nombreCliente: nuevaReserva.nombreCliente,
      apellidoCliente: nuevaReserva.apellidoCliente,
    };

    //new:true, significa que va a retornar los datos actualizados
    const reservaActualizada = await Reserva.findByIdAndUpdate(
      reservaId,
      // nuevaReserva,
      camposValidos,
      { new: true }
    );

    //Buscar al cliente por ID (que está en reservaActualizada.cliente)
    const cliente = await Cliente.findOne({ dni: reservaActualizada.cliente });
    if (!cliente) {
      return res.status(404).json({
        ok: false,
        msg: "Cliente no encontrado",
      });
    }

    const email = cliente.email;
    const fechaFormateada = reservaActualizada.fechaCopia
      ? new Date(reservaActualizada.fechaCopia).toLocaleDateString("es-AR")
      : "Fecha no disponible";

    await enviarCorreoReservaActualizada(email, {
      cancha: reservaActualizada.cancha,
      fecha: fechaFormateada,
      hora: reservaActualizada.hora,
      nombre: `${reservaActualizada.nombreCliente} ${reservaActualizada.apellidoCliente}`,
      estado: reservaActualizada.estado_pago,
      observacion: reservaActualizada.observacion,
    });

    return res.status(200).json({
      ok: true,
      reserva: reservaActualizada,
      msg: "Reserva actualizada",
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * ELIMINAR RESERVAS - ENVIO DE CORREO
 */
const eliminarReserva = async (req, res = response) => {
  const reservaId = req.params.id;
  try {
    const reserva = await Reserva.findById(reservaId);

    if (!reserva) {
      return res.status(400).json({
        ok: false,
        msg: "La reserva no existe",
      });
    }

    //new:true, significa que va a retornar los datos actualizados
    // await Reserva.findByIdAndDelete(reservaId); ANULO, PARA EN VEZ DE ELIMINAR, ACTUALICE

    // En vez de eliminar, cambiamos el estado
    reserva.estado = "inactivo";
    await reserva.save();

    //Buscar al cliente por ID (que está en reservaActualizada.cliente)
    const cliente = await Cliente.findOne({ dni: reserva.cliente });

    const email = cliente.email;
    const fechaFormateada = reserva.fechaCopia
      ? new Date(reserva.fechaCopia).toLocaleDateString("es-AR")
      : "Fecha no disponible";

    await enviarCorreoReservaEliminada(email, {
      fecha: fechaFormateada,
      hora: reserva.hora,
      nombre: `${reserva.nombreCliente} ${reserva.apellidoCliente}`,
      cancha: reserva.cancha,
    });

    res.json({
      ok: true,
      msg: "Reserva Eliminada",
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * SECCION REPORTES
 */
/**
 * REPORTE: CONSULTAR EL ESTADO DE LAS RESERVAS FILTRADO POR ESTADO DE PAGO Y RANGO DE FECHAS
 */
const estadoReservasRango = async (req, res = response) => {
  const { estado_pago, fechaIni, fechaFin } = req.params;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!fechaIni || !fechaFin) {
    return res.status(400).json({
      ok: false,
      msg: "Debe especificar las fechas de inicio y fin",
    });
  }

  try {
    const rangoFechas = {
      $gte: new Date(fechaIni),
      $lte: new Date(fechaFin),
    };

    // Filtrar reservas según estado y rango
    // const filter = {
    //   estado_pago,
    //   fecha: rangoFechas,
    // }; ANULO, PORQUE AGREGO TAMBIEN AL FILTRO ESTADO
    const filter = {
      estado_pago,
      fecha: rangoFechas,
      $or: [{ estado: "activo" }, { estado: { $exists: false } }],
    };

    const totalItems = await Reserva.countDocuments(filter);

    if (totalItems === 0) {
      return res.status(404).json({
        ok: false,
        msg: "No se encontraron reservas en el rango de fechas especificado",
        reservasFormateadas: [],
        totalPages: 1,
      });
    }

    const estadoReservas = await Reserva.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ fecha: 1 });

    const reservasFormateadas = estadoReservas.map((reserva) => {
      const base = {
        nombre: reserva.nombreCliente,
        apellido: reserva.apellidoCliente,
        fecha: reserva.fechaCopia,
        cancha: reserva.cancha,
        hora: reserva.hora,
        estado: reserva.estado_pago,
      };

      switch (estado_pago) {
        case "TOTAL":
          return { ...base, monto_total: reserva.monto_cancha };
        case "SEÑA":
          return { ...base, monto_sena: reserva.monto_sena };
        case "IMPAGO":
          return base;
        default:
          return null;
      }
    });

    return res.status(200).json({
      ok: true,
      reservasFormateadas,
      page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      msg: "Estado de las reservas",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * REPORTE: RECAUDACION, FILTRO POR FECHA Y CANCHA- CALCULAR MONTO TOTAL DEL CONSOLIDADO - CALCULAR MONTO DEUDA
 */
const estadoRecaudacion = async (req, res = response) => {
  try {
    const { cancha, fechaIni, fechaFin } = req.params;

    if (!fechaIni || !fechaFin || !cancha) {
      return res.status(400).json({
        ok: false,
        msg: "Debe especificar la cancha y el rango de fechas",
      });
    }

    // Usamos la lógica que sabés que funciona
    const fechaInicio = new Date(fechaIni);
    const fechaFinal = new Date(fechaFin);

    if (isNaN(fechaInicio.getTime()) || isNaN(fechaFinal.getTime())) {
      return res.status(400).json({
        ok: false,
        msg: "Fechas inválidas. Verifica el formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)",
      });
    }

    // const reservas = await Reserva.find({
    //   fecha: {
    //     $gte: fechaInicio,
    //     $lte: fechaFinal,
    //   },
    //   cancha,
    // }); ANULO, AGREGO FILTRO POR ESTADO
    const reservas = await Reserva.find({
      fecha: {
        $gte: fechaInicio,
        $lte: fechaFinal,
      },
      cancha,
      $or: [{ estado: "activo" }, { estado: { $exists: false } }],
    });

    if (!reservas.length) {
      return res.status(404).json({
        ok: false,
        msg: "No se encontraron reservas para el rango de fechas y cancha seleccionados",
      });
    }

    // Buscar configuración del precio
    const config = await Configuracion.findOne({ nombre: cancha });
    const montoCancha = config?.monto_cancha || 0;

    // Agrupar por día
    const resumenMap = new Map();
    reservas.forEach((reserva) => {
      const fechaStr = new Date(reserva.fechaCopia).toISOString().split("T")[0];

      if (!resumenMap.has(fechaStr)) {
        resumenMap.set(fechaStr, {
          Fecha: fechaStr,
          Cancha: cancha,
          monto_consolidado: 0,
          senas_consolidadas: 0,
          monto_deuda: 0,
          total_reservas: 0,
        });
      }

      const resumen = resumenMap.get(fechaStr);
      const monto = reserva.monto_cancha || 0;
      const sena = reserva.monto_sena || 0;

      resumen.monto_consolidado += monto;
      resumen.senas_consolidadas += sena;
      resumen.total_reservas += 1;
    });

    // Calcular deuda
    const resumenFinal = Array.from(resumenMap.values()).map((res) => ({
      ...res,
      monto_deuda:
        montoCancha * res.total_reservas -
        res.monto_consolidado -
        res.senas_consolidadas,
    }));

    // Paginación
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const totalPaginas = Math.ceil(resumenFinal.length / pageSize);
    const inicio = (page - 1) * pageSize;
    const fin = inicio + pageSize;

    return res.status(200).json({
      ok: true,
      // cantReservas: resumen.total_reservas,
      resultados: resumenFinal.slice(inicio, fin),
      totalPaginas,
      msg: "Resumen de recaudación por rango generado correctamente",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      msg: "Error al calcular el estado de recaudación por rango",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * REPORTE: RECAUDACION CON FORMAS DE PAGO
 */
const recaudacionFormasDePago = async (req, res = response) => {
  const { fechaCopia, cancha, forma_pago, estado_pago } = req.params;

  // Parámetros de paginación (con valores por defecto)
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    // Construcción dinámica del filtro
    // const filters = { fecha: fechaCopia };

    // if (cancha !== "TODAS") filters.cancha = cancha;
    // if (forma_pago !== "TODAS") filters.forma_pago = forma_pago;
    // if (estado_pago !== "TODAS") filters.estado_pago = estado_pago; ANULO PARA AGREGAR FILTRO POR ESTADO
    const filters = { fecha: fechaCopia };

    if (cancha !== "TODAS") filters.cancha = cancha;
    if (forma_pago !== "TODAS") filters.forma_pago = forma_pago;
    if (estado_pago !== "TODAS") filters.estado_pago = estado_pago;

    filters.$or = [{ estado: "activo" }, { estado: { $exists: false } }];

    // Conteo total de resultados sin paginar
    const totalItems = await Reserva.countDocuments(filters);

    if (totalItems === 0) {
      return res.status(404).json({
        ok: false,
        reservas: [],
        totalPages: 1,
        msg: "No se encontraron reservas para los filtros seleccionados",
      });
    }

    // Consulta paginada
    const reservas = await Reserva.find(filters)
      .sort({ hora: 1 }) // Ordena por horario
      .skip(skip)
      .limit(limit);

    // Resumen de los datos obtenidos
    const resumen = reservas.map((reserva) => ({
      Fecha: reserva.fechaCopia,
      Hora: reserva.hora,
      Cancha: reserva.cancha,
      Monto: reserva.monto_cancha,
      Seña: reserva.monto_sena,
      Forma_Pago: reserva.forma_pago,
      Estado_Pago: reserva.estado_pago,
      Nombre: reserva.nombreCliente,
      Apellido: reserva.apellidoCliente,
      Usuario: reserva.user,
    }));

    return res.status(200).json({
      ok: true,
      msg: "Listado de reservas",
      page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      resumen,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

module.exports = {
  getReserva,
  getReservaFecha,
  getReservaFechaCancha,
  getReservaClienteRango,
  crearReserva,
  actualizarReserva,
  eliminarReserva,
  estadoReservasRango,
  estadoRecaudacion,
  recaudacionFormasDePago,
  getCanchaHora,
  obtenerHorasDisponibles,
  obtenerMontoPorEstado,
};
