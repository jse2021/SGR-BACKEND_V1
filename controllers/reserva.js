const { response } = require('express')
const { body } = require('express-validator')
const Reserva = require('../models/Reserva')
const Cliente = require('../models/Cliente')
const Usuario = require('../models/Usuario')
const Cancha = require('../models/Cancha')
const Configuracion = require('../models/configuracion')





/**
 * CREAR RESERVAS
 */
const crearReserva = async(req, res = response)=> {

    const reserva = new Reserva(req.body);   
  
    const configuracion = await Configuracion.find();

    const clientes = await Cliente.find();  
    const reservasRegistradas = await Reserva.find();
    const clienteRequest = req.body.cliente;     
    const canchaRequest = req.body.cancha;
    const estadoPagoRequest = req.body.estado_pago;
    const fechaRequest = req.body.fecha;
    const horaRequest = req.body.hora;
    const uid = req.uid;
    

    const existeCliente = clientes.find(cliente => cliente.dni === clienteRequest);  
    const existeCancha = configuracion.find(configuracion => configuracion.nombre === canchaRequest);
    const existeHorario = reservasRegistradas.find(reserva => {
        return (
            reserva.fechaCopia === fechaRequest &&
            reserva.hora === horaRequest &&
            reserva.cancha === canchaRequest
        )
    })
    console.log({existeHorario});
    
    
    try {

        if (existeHorario) {
            return  res.status(400).json({
                ok:false,
                msg: "La fecha, hora y cancha tiene horarios registrado",       
            })   
        }
        if (!existeHorario) {          
               
        if (!existeCancha) {
            return res.status(400).json({
                ok: false, 
                msg: "No existe cancha",
            })  
        }

        if (!existeCliente) {
           return res.status(400).json({
                ok: false, 
                msg: "No existe cliente",
            }) 
        }

        if (estadoPagoRequest === "TOTAL") {
            reserva.monto_cancha = existeCancha.monto_cancha;
            reserva.monto_sena = 0.00;
        }else if (estadoPagoRequest === "SEÑA") {
            reserva.monto_cancha = 0.00;
            reserva.monto_sena = existeCancha.monto_sena;
        }else if (estadoPagoRequest === "IMPAGO") {
            reserva.monto_cancha = 0.00;
            reserva.monto_sena = 0.00;
        }
        
        /**
         * asociar a la reserva, el usuario creador
         */
        const user = await Usuario.findOne({_id:uid});
        const username = user.user;
        reserva.user = username;

        // Asocio a la reserva el cliente solicitador
        const clienteApellido = existeCliente.apellido;
        const clienteNombre = existeCliente.nombre;
        reserva.apellidoCliente = clienteApellido;
        reserva.nombreCliente = clienteNombre;
     
        
        reserva.fechaCopia = fechaRequest;

        const guardarReserva = await reserva.save(); 
        return  res.status(201).json({
              ok:true,
              msg: "Reserva registrada  exitosamente",       
              reserva: guardarReserva,
          })
        } 
    } catch (error) { 
        console.log({error})
            return  res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }       
}

/**
 * CONSULTAR TODAS LAS RESERVAS DEL SISTEMA
 */

const getReserva =async (req, res = response)=> {

    const reservas = await Reserva.find();

    if (!reservas) {
        return res.status(400).json({
            ok: false,
            msg:"No existen reservas"
        })
    }

     return res.status(200).json({
        ok: true, 
        reservas,
        msg: "Listar todas las reservas"
    })
}


/**
 * CONSULTAR RESERVAS POR FECHA.
 */
const getReservaFecha = async(req, res = response)=> {
    const {fechaCopia} = req.params;
    const reservasFecha = await Reserva.find({fechaCopia});
    console.log({reservasFecha});
    
    try {

        if (reservasFecha == "") {
            return res.status(400).json({
                ok: false,
                msg:"No existen reservas asociadas a la fecha"
            })
        }
            return res.status(200).json({
                ok: true, 
                reservasFecha,
                msg: "Traigo todas las reservas"
            })     
    } catch (error) {
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}

/*
*CONSULTAR RESERVAS POR FECHA Y CANCHA
*/
const getReservaFechaCancha = async(req, res = response) => {
    const {fechaCopia,cancha} = req.params;
   // Busca las reservas de la fecha
    const reservasFecha = await Reserva.find({
        fechaCopia,
        cancha: cancha
    });
    try {
        if (reservasFecha == "") {
            return res.status(400).json({
                ok: false,
                msg:"No existen reservas asociadas a la fecha"
            })
        }
        return res.status(200).json({
            ok: true, 
            reservasFecha,
            msg: "Traigo todas las reservas",
        })     
    } catch (error) {
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}

/**
 * CONSULTAR RESERVA: POR CLIENTE(APELLIDO) EN UN RANGO DE FECHAS
 */
const getReservaClienteRango = async (req, res = response) => {
    const {apellidoCliente, fechaIni, fechaFin} = req.params;
  
    try {    
        
            const rangoFechas = {
                $gte: new Date(fechaIni),
                $lte: new Date(fechaFin)
            };

            // Obtiene las reservas del cliente especificado en el rango de fechas especificado
                const reservasCliente = await Reserva.find({
                    apellidoCliente,
                    fecha: rangoFechas
                });
            console.log({reservasCliente})
        
            if (reservasCliente == "") {
                return res.status(400).json({
                    ok: false, 
                    msg: "No existen reservas para el cliente indicado",
                })  
            }
            return res.status(200).json({
                ok: true, 
                reservasCliente,
                msg: "Listado de reservas del cliente",
            })  
        }    
    catch (error) {
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}


/**
 *  ACTUALIZAR LAS RESERVAS: NO SE PODRA ACTUALIZAR LA FECHA PARA EVITAR ERRORES DE DATOS INCONSISTENTES 
 */
const actualizarReserva = async (req, res = response)=> {

    const reservaId = req.params.id;
    const fecha_copia  = req.body.fecha_copia;
        try {

            if (fecha_copia) {     
                return  res.status(400).json({
                    ok: false,
                    msg:'No es posible cambiar la fecha'
                })
            } 
            const reserva = await Reserva.findById(reservaId)
                if (!reserva) {
                    return  res.status(400).json({
                        ok: false,
                        msg:'La reserva no existe'
                    })
                }
            const nuevaReserva = { 
            ...req.body
            }
            //new:true, significa que va a retorar los datos actualizados
            const reservaActualizada = await Reserva.findByIdAndUpdate(reservaId, nuevaReserva,{new: true}); 
            return res.status(200).json({
                ok: true, 
                reserva: nuevaReserva,
                msg: "Reserva actualizada"
            })
        }
        catch (error) {  
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
        }
}


const eliminarReserva = async(req, res = response)=> {


    const reservaId = req.params.id;
    try {
        
       const reserva = await Reserva.findById(reservaId)
       if (!reserva) {
        return res.status(400).json({
            ok: false,
            msg:'La reserva no existe'
        })
       }

     
        //new:true, significa que va a retorar los datos actualizados
       await Reserva.findByIdAndDelete(reservaId); 
       

       res.json({
        ok: true, 
        msg: "Reserva Eliminada"
    })
       
    } catch (error) {  
        console.log({error})
        res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }

}

/**
 * SECCION REPORTES
 */
/**
 * REPORTE: CONSULTAR EL ESTADO DE LAS RESERVAS FILTRADO POR ESTADO DE PAGO
 */
const estadoReservasPorFecha = async (req, res = response) => {
    const {estado_pago,fechaIni, fechaFin} = req.params;
     
    // Valida los parámetros de entrada
     if (!fechaIni || !fechaFin) {
        return res.status(400).json({
            ok: false,
            msg: "Debe especificar las fechas de inicio y fin",
        });
    }
    try {    
        
            const rangoFechas = {
                $gte: new Date(fechaIni),
                $lte: new Date(fechaFin)
            };

            // Obtiene las reservas en el rango de fechas especificado
                const estadoReservas = await Reserva.find({
                    estado_pago,
                    fecha: rangoFechas
                });

            // Formatea los resultados de la consulta
            const reservasFormateadas = estadoReservas.map((reserva) => {
                if (estado_pago === "TOTAL") {               
                return {
                    nombre: reserva.nombreCliente,
                    apellido: reserva.apellidoCliente,
                    fecha: reserva.fechaCopia,
                    cancha: reserva.cancha,
                    estado: reserva.estado_pago,
                    monto_total: reserva.monto_cancha,
                    // monto_sena: reserva.monto_sena
                };
            }
            if (estado_pago === "SEÑA") {               
                return {
                    nombre: reserva.nombreCliente,
                    apellido: reserva.apellidoCliente,
                    fecha: reserva.fechaCopia,
                    cancha: reserva.cancha,
                    estado: reserva.estado_pago,
                    // monto_total: reserva.monto_cancha,
                    monto_sena: reserva.monto_sena
                };
            }
            if (estado_pago === "IMPAGO") {               
                return {
                    nombre: reserva.nombreCliente,
                    apellido: reserva.apellidoCliente,
                    fecha: reserva.fechaCopia,
                    cancha: reserva.cancha,
                    estado: reserva.estado_pago,
                    // monto_total: reserva.monto_cancha,
                    // monto_sena: reserva.monto_sena
                };
            }

            });

            // Valida si se encontraron reservas
            if (!reservasFormateadas.length) {
                return res.status(404).json({
                    ok: false,
                    msg: "No se encontraron reservas en el rango de fechas especificado",
                });
            }

                return res.status(200).json({
                ok: true, 
                reservasFormateadas,
                msg: "Estado de las reservas",
            })  
        }    
    catch (error) {
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}


/**
 * REPORTE: RECAUDACION, FILTRO POR FECHA Y CANCHA- CALCULAR MONTO TOTAL DEL CONSOLIDADO - CALCULAR MONTO DEUDA
*/
const estadoRecaudacion = async (req, res = response) => {
    const {cancha,fechaCopia} = req.params;
 
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
            fecha: fechaCopia
        });

        if (!reservasRegistradas[0]) {
            return res.status(400).json({
                ok: false, 
                msg: "No existen reservas para la cancha indicada o fecha",
            })  
        }else{
            // saber cuantas fechas iguales existen
            const fechasIguales = reservasRegistradas.filter((reserva) => reserva.fechaCopia === reserva.fechaCopia);         
            cantidadFechasIguales = fechasIguales.length;

            //saber cuantas reservas de la fecha tienen monto_cancha = 0
            const montoCero = reservasRegistradas.filter((reserva) => reserva.fechaCopia === reserva.fechaCopia && reserva.monto_cancha === 0);         
            cantidadMontoCero = montoCero.length;
            
            //saber cuantas reservas de la fecha tienen monto_senas = 0
            const montoCeroSenas = reservasRegistradas.filter((reserva) => reserva.fechaCopia === reserva.fechaCopia && reserva.monto_sena === 0);         
            cantidadMontoCeroSenas = montoCeroSenas.length;

            const resumen = reservasRegistradas.reduce((total, reserva) => {
                total.monto_consolidado += reserva.monto_cancha;
                total.senas_consolidadas += reserva.monto_sena;
                
                /**
                 * CUANDO SOLO EXISTE  MONTO CANCHA
                 */
                if (cantidadMontoCero == 0 && cantidadMontoCeroSenas > 0 ) {
                    total.monto_deuda = total.senas_consolidadas;
                }
                
                /**
                 * CUANDO SOLO EXISTEN SEÑAS
                 */
                if (cantidadMontoCero > 0 && cantidadMontoCeroSenas == 0 ) {
                    total.monto_deuda = (montoCancha * cantidadMontoCero) - total.senas_consolidadas;
                } 
                
                /**
                 * SI MONTO_CONSOLIDADO === SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK 
                 */
                if ((total.monto_consolidado === total.senas_consolidadas) && (cantidadMontoCero > 0)) {
                    total.monto_deuda = (montoCancha * cantidadMontoCero) - total.senas_consolidadas;
                }

                 /**
                 * SI MONTO_CONSOLIDADO > SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK 
                 */
                 if ((total.monto_consolidado > total.senas_consolidadas) && (cantidadMontoCero > 0)) {
                    total.monto_deuda = (montoCancha * cantidadMontoCero) - total.senas_consolidadas;
                }

                  /**
                 * SI MONTO_CONSOLIDADO < SENAS_CONSOLIDADAS Y CANT_MONTO_CONSOLIDADO > 0 OK 
                 */
                  if ((total.monto_consolidado < total.senas_consolidadas) && (cantidadMontoCero > 0)) {
                    total.monto_deuda = (montoCancha * cantidadMontoCero) - total.senas_consolidadas;
                }
                
                return total;

              }, {
                Fecha: fechaCopia,
                Cancha: cancha,
                monto_consolidado: 0,
                senas_consolidadas: 0,
                monto_deuda: 0,
              });  
            return res.status(200).json({
                ok: true, 
                resumen,
                msg: "Estado de las reservas",
            })  
        }
    }    
    catch (error) {

    }

}    

/**
 * REPORTE: RECAUDACION CON FORMAS DE PAGO
 * 1- deberá tener parametros : fecha, cancha, forma_pago, estado_pago
 * 2- deberá mostrar todas las hora de la fecha indicada
 * 3- de la fecha, discrimina por estado, total, seña, impago 
 * 4- si la seña se paga con efectivo y luego el total con transferencia -> ver que mostrar en todas las posibilidades de similar situacion
 * 5- deberá mostrar las suma total sea cual sea el caso
 * 6- Formas de pago: Tarjeta, Debito, Efectivo, Transferencia
 */
const recaudacionFormasDePago = async (req, res = response) => {
    const {fechaCopia, cancha, forma_pago, estado_pago } = req.params;
    let monto_consolidado = 0;
    let sena_consolidada = 0;
    let cantidad_señas = 0;
    let cantidad_monto = 0;
    let guardo_fPago;

    try {
    
        // Obtiene las reservas
        const reservasRegistradas = await Reserva.find({
            fecha: fechaCopia,
            cancha,
            forma_pago,
            estado_pago
        });

        //Obtengo si existen señas
        const senas = reservasRegistradas.filter((reserva) => reserva.estado_pago === "SEÑA");         
        cantidad_señas = senas.length;

        //Obtengo si existen montos
        const monto = reservasRegistradas.filter((reserva) => reserva.estado_pago === "TOTAL");         
        cantidad_monto = monto.length;
  
        const resumenListado = reservasRegistradas.map((reserva) => {
            monto_consolidado = reserva.monto_cancha + monto_consolidado;
            sena_consolidada = reserva.monto_sena + sena_consolidada;

            if (cantidad_señas > 0) {
                guardo_fPago = reserva.forma_pago;
                return {
                    id: reserva.id,
                    Fecha: reserva.fechaCopia,
                    Hora: reserva.hora,
                    Cancha: reserva.cancha,
                    Monto: reserva.monto_cancha,
                    Seña: reserva.monto_sena,
                    Pago_Monto: "-",
                    Pago_Sena: reserva.forma_pago,
                    Usuario: reserva.user
                };
            }

            // 6512e98e2f6de162adacc1d3
            // return {
            //     Fecha: reserva.fechaCopia,
            //     Hora: reserva.hora,
            //     Cancha: reserva.cancha,
            //     Monto: reserva.monto_cancha,
            //     Seña: reserva.monto_sena,
            //     Forma_Pago: reserva.forma_pago,
            //     Usuario: reserva.user
            // };
        })

        return res.status(200).json({
            ok: true, 
            resumenListado,
            msg: "Listado de reservas",
        })         
    } catch (error) {
        console.log({error})
        return res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}


module.exports = {
    getReserva,
    getReservaFecha,
    getReservaFechaCancha,
    getReservaClienteRango,
    crearReserva,
    actualizarReserva,
    eliminarReserva,
    estadoReservasPorFecha,
    estadoRecaudacion,
    recaudacionFormasDePago

}

