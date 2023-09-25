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


const actualizarReserva = async (req, res = response)=> {


    const reservaId = req.params.id;
    try {
        
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
       

       res.json({
        ok: true, 
        reserva: nuevaReserva,
        msg: "Reserva actualizada"
    })
       
    } catch (error) {  
        console.log({error})
        res.status(500).json({
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
 * REPORTE: RECAUDACION, FILTRO POR FECHA Y CANCHA- CALCULAR MONTO TOTAL DEL CONSOLIDADO
 * 1- deberá traer un objeto por fecha y cancha
 * 2- si la fecha es distinta, no deberá continuar la suma de monto_consolidado y sena_consolidada
 * 3- si la reserva solo tiene señas, se debera vincular u obtener el precio de la cancha para realizar el calculo de diferencia adeudada.
 */
const estadoRecaudacion = async (req, res = response) => {
    const {cancha,fechaIni, fechaFin} = req.params;
    let monto_consolidado = 0.0;
    let senas_consolidadas = 0.0;
    let monto_deuda = 0.0;   
        
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

            // Obtengo el precio de la cancha
            const precioCancha = await Configuracion.find({
                nombre: cancha, 
            });
            const montoCancha = precioCancha?.[0]?.monto_cancha;
   
            // Obtiene las reservas en el rango de fechas especificado
                const estadoReservas = await Reserva.find({
                    cancha,
                    fecha: rangoFechas
                });

            // Formatea los resultados de la consulta
            const reservasFormateadas = estadoReservas.map((reserva) => {
                 
                    monto_consolidado = reserva.monto_cancha + monto_consolidado;
                    senas_consolidadas = reserva.monto_sena + senas_consolidadas;
                    monto_deuda = monto_consolidado - senas_consolidadas;

                    // Crea un nuevo arreglo que contenga solo las reservas con la misma fecha
                    const fechasIguales = estadoReservas.filter((reserva) => reserva.fechaCopia === reserva.fechaCopia);
                    const contarFechas = fechasIguales.length;
                    console.log({contarFechas})

                    // Trato: si los montos consolidados = 0, trabajo la fecha de la tabla configuracion
                    if (monto_consolidado === 0) {
                        monto_deuda = senas_consolidadas; 
                        console.log({monto_deuda})
                     
                        if (contarFechas > 1) {
                            monto_deuda = 0;
                            monto_deuda = (montoCancha * contarFechas) - senas_consolidadas;    
                        }
                    }

                    // Trabajar con fechas distintas para que no se sumen todos los montos
                    
                    
                        if (senas_consolidadas === 0) {
                            monto_deuda = 0;
                        }

                        // monto_deuda = monto_consolidado - senas_consolidadas
                    
                    
                    // si las fechas son distintas, evitar que continue la suma
                    // if (!fechasIguales) {
                      
                    // }   
                    
                    // si no existen senas_consolidadas, deuda  = 0
                    
                 return {
                    fecha: reserva.fechaCopia,
                    cancha: reserva.cancha,
                    monto_consolidado: monto_consolidado,
                    sena: senas_consolidadas,
                    pendiente_pago: monto_deuda
                };
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

module.exports = {
    getReserva,
    getReservaFecha,
    getReservaFechaCancha,
    getReservaClienteRango,
    crearReserva,
    actualizarReserva,
    eliminarReserva,
    estadoReservasPorFecha,
    estadoRecaudacion

}

