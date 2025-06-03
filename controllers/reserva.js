const { response } = require("express");
const axios = require("axios");
const { body } = require("express-validator");
const Reserva = require("../models/Reserva");
const Cliente = require("../models/Cliente");
const Usuario = require("../models/Usuario");
const Cancha = require("../models/Cancha");
const Configuracion = require("../models/configuracion");
const {
  enviarCorreoReserva,
  enviarCorreoReservaActualizada,
  enviarCorreoReservaEliminada,
} = require("../helpers/mailer");

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
    const token = req.header("x-token"); // Asegurate que venga desde el frontend

    // LLAMADO INTERNO AL ENDPOINT obtenerMontoPorEstado
    const { data } = await axios.post(
      "http://localhost:4000/api/reserva/obtener-monto",
      {
        cancha: canchaRequest,
        estado_pago: estadoPagoRequest,
      },
      {
        headers: {
          "x-token": token, // pasás el mismo token que se usó para autenticar la petición original
        },
      }
    );
    console.log(data);
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
    console.error({ error });
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

    const reservasRegistradas = await Reserva.find({
      fechaCopia: fecha,
      cancha,
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
    console.error(error);
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
    console.error(error);
    return res.status(500).json({ ok: false, msg: "Error interno" });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * CONSULTAR TODAS LAS RESERVAS DEL SISTEMA
 */

const getReserva = async (req, res = response) => {
  const reservas = await Reserva.find();

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
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * CONSULTAR RESERVAS POR FECHA. (LO VOY A UTILIZAR PARA LOS REPORTES)
 */

const getReservaFecha = async (req, res = response) => {
  const { fechaCopia } = req.params;
  const reservasFecha = await Reserva.find({ fechaCopia });

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
    console.log({ error });
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

  try {
    //uso estas fechas, sin importar el horario.
    const fechaInicio = new Date(fecha);
    fechaInicio.setUTCHours(0, 0, 0, 0);

    const fechaFin = new Date(fecha);
    fechaFin.setUTCHours(23, 59, 59, 999);

    // Busca las reservas de la fecha
    const reservasFecha = await Reserva.find({
      fecha: {
        $gte: fechaInicio,
        $lt: fechaFin,
      },
      cancha: cancha,
    });
    if (reservasFecha.length === 0) {
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
    console.log({ error });
    return res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};
//--------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * CONSULTAR RESERVA: POR CLIENTE(APELLIDO) EN UN RANGO DE FECHAS
 * 14/05 - PROXIMA IMPLEMENTACION: VER SI PODEMOS CONSULTAR POR NOMBRE, O APELLIDO DEL CLIENTE
 */
const getReservaClienteRango = async (req, res = response) => {
  const { cliente, fechaIni, fechaFin } = req.params;

  try {
    const rangoFechas = {
      $gte: new Date(fechaIni),
      $lte: new Date(fechaFin),
    };

    // Obtiene las reservas del cliente especificado en el rango de fechas especificado
    const reservasCliente = await Reserva.find({
      cliente,
      fecha: rangoFechas,
    });

    if (reservasCliente == "") {
      return res.status(400).json({
        ok: false,
        msg: "No existen reservas para el cliente indicado",
      });
    }
    return res.status(200).json({
      ok: true,
      reservasCliente,
      msg: "Listado de reservas del cliente",
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
 *  ACTUALIZAR LAS RESERVAS
 */
const actualizarReserva = async (req, res = response) => {
  const reservaId = req.params.id;
  const fecha_copia = req.body.fecha_copia;

  console.log("Paso por actualizar: ", req.body);

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

    console.log("Antes del if: ", nuevaReserva.cancha);

    // Si cambia el estado_pago o la cancha, consultar nuevo monto
    if (estado_pago && cancha) {
      try {
        console.log("Entro al if");
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
        console.log("Nuevo monto actualizado:", nuevaReserva);
      } catch (error) {
        console.error(
          "Error al obtener el nuevo monto:",
          error?.response?.data || error.message
        );
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

    //new:true, significa que va a retorar los datos actualizados
    const reservaActualizada = await Reserva.findByIdAndUpdate(
      reservaId,
      // nuevaReserva,
      camposValidos,
      { new: true }
    );
    console.log("RESERVA ACTUALIZADA CORRECTAMENTE:", reservaActualizada);

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

    //new:true, significa que va a retorar los datos actualizados
    await Reserva.findByIdAndDelete(reservaId);

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
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};

/**
 * SECCION REPORTES
 */
/**
 * REPORTE: CONSULTAR EL ESTADO DE LAS RESERVAS FILTRADO POR ESTADO DE PAGO Y RANGO DE FECHAS
 */
// const estadoReservasPorFecha = async (req, res = response) => {
//   const { estado_pago, fechaIni, fechaFin } = req.params;

//   // Valida los parámetros de entrada
//   if (!fechaIni || !fechaFin) {
//     return res.status(400).json({
//       ok: false,
//       msg: "Debe especificar las fechas de inicio y fin",
//     });
//   }
//   try {
//     const rangoFechas = {
//       $gte: new Date(fechaIni),
//       $lte: new Date(fechaFin),
//     };

//     // Obtiene las reservas en el rango de fechas especificado
//     const estadoReservas = await Reserva.find({
//       estado_pago,
//       fecha: rangoFechas,
//     });

//     // Formatea los resultados de la consulta
//     const reservasFormateadas = estadoReservas.map((reserva) => {
//       if (estado_pago === "TOTAL") {
//         return {
//           nombre: reserva.nombreCliente,
//           apellido: reserva.apellidoCliente,
//           fecha: reserva.fechaCopia,
//           cancha: reserva.cancha,
//           estado: reserva.estado_pago,
//           monto_total: reserva.monto_cancha,
//           // monto_sena: reserva.monto_sena
//         };
//       }
//       if (estado_pago === "SEÑA") {
//         return {
//           nombre: reserva.nombreCliente,
//           apellido: reserva.apellidoCliente,
//           fecha: reserva.fechaCopia,
//           cancha: reserva.cancha,
//           estado: reserva.estado_pago,
//           // monto_total: reserva.monto_cancha,
//           monto_sena: reserva.monto_sena,
//         };
//       }
//       if (estado_pago === "IMPAGO") {
//         return {
//           nombre: reserva.nombreCliente,
//           apellido: reserva.apellidoCliente,
//           fecha: reserva.fechaCopia,
//           cancha: reserva.cancha,
//           estado: reserva.estado_pago,
//           // monto_total: reserva.monto_cancha,
//           // monto_sena: reserva.monto_sena
//         };
//       }
//     });

//     // Valida si se encontraron reservas
//     if (!reservasFormateadas.length) {
//       return res.status(404).json({
//         ok: false,
//         msg: "No se encontraron reservas en el rango de fechas especificado",
//       });
//     }

//     return res.status(200).json({
//       ok: true,
//       reservasFormateadas,
//       msg: "Estado de las reservas",
//     });
//   } catch (error) {
//     console.log({ error });
//     return res.status(500).json({
//       ok: false,
//       msg: "Consulte con el administrador",
//     });
//   }
// };

/**
 * REPORTE: RECAUDACION, FILTRO POR FECHA Y CANCHA- CALCULAR MONTO TOTAL DEL CONSOLIDADO - CALCULAR MONTO DEUDA
 */
const estadoRecaudacion = async (req, res = response) => {
  const { cancha, fechaCopia } = req.params;

  let cantidadFechasIguales = 0;
  let cantidadMontoCero = 0;
  let cantidadMontoCeroSenas = 0;

  try {
    // Obtengo el precio de la cancha
    const precioCancha = await Configuracion.find({
      nombre: cancha,
    });
    const montoCancha = precioCancha?.[0]?.monto_cancha;

    // Obtiene las reservas en el rango de fechas especificado
    const reservasRegistradas = await Reserva.find({
      cancha,
      fecha: fechaCopia,
    });

    if (!reservasRegistradas[0]) {
      return res.status(400).json({
        ok: false,
        msg: "No existen reservas para la cancha indicada o fecha",
      });
    } else {
      // saber cuantas fechas iguales existen
      const fechasIguales = reservasRegistradas.filter(
        (reserva) => reserva.fechaCopia === reserva.fechaCopia
      );
      cantidadFechasIguales = fechasIguales.length;

      //saber cuantas reservas de la fecha tienen monto_cancha = 0
      const montoCero = reservasRegistradas.filter(
        (reserva) =>
          reserva.fechaCopia === reserva.fechaCopia &&
          reserva.monto_cancha === 0
      );
      cantidadMontoCero = montoCero.length;

      //saber cuantas reservas de la fecha tienen monto_senas = 0
      const montoCeroSenas = reservasRegistradas.filter(
        (reserva) =>
          reserva.fechaCopia === reserva.fechaCopia && reserva.monto_sena === 0
      );
      cantidadMontoCeroSenas = montoCeroSenas.length;

      const resumen = reservasRegistradas.reduce(
        (total, reserva) => {
          total.monto_consolidado += reserva.monto_cancha;
          total.senas_consolidadas += reserva.monto_sena;

          /**
           * CUANDO SOLO EXISTE  MONTO CANCHA
           */
          if (cantidadMontoCero == 0 && cantidadMontoCeroSenas > 0) {
            total.monto_deuda = total.senas_consolidadas;
          }

          /**
           * CUANDO SOLO EXISTEN SEÑAS
           */
          if (cantidadMontoCero > 0 && cantidadMontoCeroSenas == 0) {
            total.monto_deuda =
              montoCancha * cantidadMontoCero - total.senas_consolidadas;
          }

          /**
           * SI MONTO_CONSOLIDADO === SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK
           */
          if (
            total.monto_consolidado === total.senas_consolidadas &&
            cantidadMontoCero > 0
          ) {
            total.monto_deuda =
              montoCancha * cantidadMontoCero - total.senas_consolidadas;
          }

          /**
           * SI MONTO_CONSOLIDADO > SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK
           */
          if (
            total.monto_consolidado > total.senas_consolidadas &&
            cantidadMontoCero > 0
          ) {
            total.monto_deuda =
              montoCancha * cantidadMontoCero - total.senas_consolidadas;
          }

          /**
           * SI MONTO_CONSOLIDADO < SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK
           */
          if (
            total.monto_consolidado < total.senas_consolidadas &&
            cantidadMontoCero > 0
          ) {
            total.monto_deuda =
              montoCancha * cantidadMontoCero - total.senas_consolidadas;
          }

          return total;
        },
        {
          Fecha: fechaCopia,
          Cancha: cancha,
          monto_consolidado: 0,
          senas_consolidadas: 0,
          monto_deuda: 0,
        }
      );
      return res.status(200).json({
        ok: true,
        resumen,
        msg: "Estado de las reservas",
      });
    }
  } catch (error) {}
};

/**
 * REPORTE: RECAUDACION CON FORMAS DE PAGO
 * 1- deberá tener parametros : fecha, cancha, forma_pago, estado_pago
 * 2- deberá mostrar todas las hora de la fecha indicada
 * 3- de la fecha, discrimina por estado, total, seña, impago
 * 4- deberá mostrar las suma total sea cual sea el caso
 * 5- Formas de pago: Tarjeta, Debito, Efectivo, Transferencia
 * 6- TENDRA DISTINTOS FILTROS COMO CONSULTAR TODAS LAS CANCHAS Y TODAS LAS FORMAS DE PAGO DE UNA FECHA
 * 7-
 */
const recaudacionFormasDePago = async (req, res = response) => {
  const { fechaCopia, cancha, forma_pago, estado_pago } = req.params;
  let monto_consolidado = 0;
  let sena_consolidada = 0;
  let cantidad_señas = 0;
  let cantidad_monto = 0;

  try {
    // Obtiene las reservas con filtros fecha, cancha, forma_pago, estado_pago
    const reservasRegistradas = await Reserva.find({
      fecha: fechaCopia,
      cancha,
      forma_pago,
      estado_pago,
    });

    //obtiene las reservas de todas las canchas
    const reservasfiltroCancha = await Reserva.find({
      fecha: fechaCopia,
      forma_pago,
      estado_pago,
    });

    // obtiene las reservas con todos los pagos
    const reservasfiltroPagos = await Reserva.find({
      fecha: fechaCopia,
      cancha,
      estado_pago,
    });

    // Obtiene las reservas con filtros fecha, cancha, forma_pago, estado_pago
    const reservasfiltroPagosCancha = await Reserva.find({
      fecha: fechaCopia,
      estado_pago,
    });

    //Obtengo si existen señas
    const senas = reservasRegistradas.filter(
      (reserva) => reserva.estado_pago === "SEÑA"
    );
    cantidad_señas = senas.length;

    //Obtengo si existen montos
    const monto = reservasRegistradas.filter(
      (reserva) => reserva.estado_pago === "TOTAL"
    );
    cantidad_monto = monto.length;

    if (forma_pago === "TODAS" && cancha === "TODAS") {
      // aplico filtro sin la cancha
      const resumenFiltro4 = reservasfiltroPagosCancha.map((reserva) => {
        return {
          Fecha: reserva.fechaCopia,
          Hora: reserva.hora,
          Cancha: reserva.cancha,
          Monto: reserva.monto_cancha,
          Seña: reserva.monto_sena,
          Forma_Pago: reserva.forma_pago,
          Usuario: reserva.user,
        };
      });
      return res.status(200).json({
        ok: true,
        resumenFiltro4,
        msg: "Listado de reservas",
      });
    }

    if (cancha === "TODAS") {
      // aplico filtro sin la cancha
      const resumenFiltro2 = reservasfiltroCancha.map((reserva) => {
        return {
          Fecha: reserva.fechaCopia,
          Hora: reserva.hora,
          Cancha: reserva.cancha,
          Monto: reserva.monto_cancha,
          Seña: reserva.monto_sena,
          Forma_Pago: reserva.forma_pago,
          Usuario: reserva.user,
        };
      });
      return res.status(200).json({
        ok: true,
        resumenFiltro2,
        msg: "Listado de reservas",
      });
    }

    if (forma_pago === "TODAS") {
      // aplico filtro sin la cancha
      const resumenFiltro3 = reservasfiltroPagos.map((reserva) => {
        return {
          Fecha: reserva.fechaCopia,
          Hora: reserva.hora,
          Cancha: reserva.cancha,
          Monto: reserva.monto_cancha,
          Seña: reserva.monto_sena,
          Forma_Pago: reserva.forma_pago,
          Usuario: reserva.user,
        };
      });
      return res.status(200).json({
        ok: true,
        resumenFiltro3,
        msg: "Listado de reservas",
      });
    }

    // funcion con filtro cancha
    const resumenListado = reservasRegistradas.map((reserva) => {
      monto_consolidado = reserva.monto_cancha + monto_consolidado;
      sena_consolidada = reserva.monto_sena + sena_consolidada;

      // 6512e98e2f6de162adacc1d3
      return {
        Fecha: reserva.fechaCopia,
        Hora: reserva.hora,
        Cancha: reserva.cancha,
        Monto: reserva.monto_cancha,
        Seña: reserva.monto_sena,
        Forma_Pago: reserva.forma_pago,
        Usuario: reserva.user,
      };
    });

    return res.status(200).json({
      ok: true,
      resumenListado,
      msg: "Listado de reservas",
    });
  } catch (error) {
    console.log({ error });
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
  // estadoReservasPorFecha,
  estadoRecaudacion,
  recaudacionFormasDePago,
  getCanchaHora,
  obtenerHorasDisponibles,
  obtenerMontoPorEstado,
};
