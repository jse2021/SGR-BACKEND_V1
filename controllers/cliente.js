const {response}= require('express')
const {validationResult} = require('express-validator')
const Cliente = require('../models/Cliente')



/**
 * CREAR CLIENTE
 * DNI - EMAIL DEBEN SER UNICOS
*/

const crearCliente = async(req, res = response) => {
    const {dni,nombre,apellido,email} = req.body;

    try {
        let cliente = await Cliente.findOne ({dni});
     
        if(cliente){
            return res.status(400).json({
                ok:false,
                msg: 'Dni ingresado esta asociado a otro cliente',
                dni: cliente.dni,
                nombre : cliente.nombre       
            })
        }      
        let clienteEmail = await Cliente.findOne ({email});
     
        if(clienteEmail){
            return res.status(400).json({
                ok:false,
                msg: 'Email ingresado esta asociado a otro cliente',
                email: clienteEmail.email
            })
        }
        cliente = new Cliente(req.body);
        await cliente.save();
        res.status(201).json({
            ok:true,
            msg: "Cliente registrado exitosamente",
            nombre,
            apellido
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
 * CONSULTA TODOS LOS CLIENTES
 * TRAE TODOS, LUEGO EN EL FRONT APLICAMOS FILTRO
  */

const getCliente = async (req, res = response) => {
    const clientes = await Cliente.find();

    try {
        if (!clientes) {
            return res.status(400).json({
                ok: false,
                msg:'El cliente no existe'
            })
           }
         
           res.json({
            ok: true, 
            clientes,
            msg: "Traigo todos los clientes"
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
 * CONSULTA CLIENTE POR APELLID
 */

const getClientePorApellido = async(req, res = response) => {
    const {apellido} = req.params;

    try {
           
           const cliente = await Cliente.find({apellido});
                if (!cliente) {
                    return  res.status(400).json({
                        ok: false,
                        msg:'El cliente no existe en la base de datos'
                    })
                }
                return res.status(200).json({
                    ok: true, 
                    cliente,
                    msg: "Traigo todos los clientes"
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
 * ACTUALIZAR CLIENTE
 * EL FILTRO SE REALIZA DESDE EL FRONT END
 * ACTUALIZADO POR DNI
 */


const actualizarCliente = async (req, res = response) => {
    const{dni} = req.params;

    try {
        const cliente = await Cliente.findOne({dni});
        if (!cliente) {
            return  res.status(400).json({
                ok: false,
                msg:'El cliente no existe en la base de datos'
            })
        }

        const nuevoCliente = {
            ...req.body
        }
        //new:true, significa que va a retorar los datos actualizados
        const clienteActualizado = await Cliente.findOneAndUpdate({dni}, nuevoCliente, {new: true})
        res.json({
            ok: true, 
            cliente: nuevoCliente,
            msg: "Cliente Actualizado"
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
 * ELIMINAR CLIENTE - EL FILTRO SE HACE DESDE EL FRONT
 * CLIENTE ELIMINADO POR DNI
 */
const eliminarCliente = async(req, res = response) => {
    const { dni } = req.params;
    try {
     
 
            const cliente = await Cliente.findOne({dni})
            if (!cliente) {
                return res.status(400).json({
                    ok: false,
                    msg:'Cliente inexistente'
                })
            }
            
            await Cliente.findOneAndDelete({dni}); 
            
            res.json({
                ok: true, 
                msg: "Cliente Eliminado"
            })
    
    } catch (error) {  
        console.log({error})
        res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }
}


module.exports = {
    crearCliente,
    getCliente,
    getClientePorApellido,
    actualizarCliente,
    eliminarCliente
}