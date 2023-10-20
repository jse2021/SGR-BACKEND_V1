const {response} = require('express')
const {validationResult} = require('express-validator')
const Cancha = require('../models/Cancha')

/**
 * BACKEND: EL USUARIO ESTANDAR PUEDE CREAR CANCHAS - EN FRONT NO VA A PODER.
 */


/**
 * CREAR CANCHAS
 */
const crearCancha = async(req, res= response)=> {
    const {nombre, medidas} = req.body;

    try {
        let cancha = await Cancha.findOne({nombre});
        if (cancha) {
            return res.status(400).json({
                ok: false,
                msg:'La cancha existe en la base de datos',
                nombre : cancha,nombre,
            })
        }
        cancha = new Cancha(req.body);
        await cancha.save();
        res.status(201).json({
            ok: false,
            msg: 'Cancha registrada exitosamente',
            nombre,
            medidas
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
 * CONSULTAR TODAS LAS CANCHAS SIN FILTRO
 */

const getCancha = async (req, res = response) => {
    const canchas = await Cancha.find();

    try {
        if (!canchas) {
            return res.status(400).json({
                ok: false,
                msg:'La cancha  no existe'
            })
        }

        return res.json({
            ok: true, 
            canchas: canchas.map((cancha) => ({
                id: cancha.id,
                nombre: cancha.nombre,
                medidas: cancha.medidas
            })),
            msg: "Traigo todas las canchas"
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
 * CONSULTAR CANCHA POR NOMBRE
 */

const getCanchaPorNombre = async(req, res = response) => {
    const {nombre} = req.params;

    try {
        
        const cancha  = await Cancha.findOne({nombre});
        if (!cancha) {
            return res.status(400).json({
                ok: false,
                msg: 'La cancha no existe en la base de datos'
            })}
            
            res.json({
                ok: true,
                cancha,
                msg:'Traigo cancha'
            })        
    } catch (error) {
        console.log({error})
        res.status(500).json({
            ok: false,
            msg: "Consulte con el administrador"
        })
    }

}




/**
 * ACTUALIZAR CANCHAS POR NOMBRE
 */

const actualizarCancha  = async(req, res  = response) => {
    const{nombre} = req.params;

    try {
        const cancha = await Cancha.findOne({nombre});
        if (!cancha) {
            return res.status(400).json({
                ok: false,
                msg:'La cancha no existe en la base de datos'
            })
        }

        const nuevaCancha = {
            ...req.body
        }
        //new:true, significa que va a retorar los datos actualizados
        const canchaActualizada = await Cancha.findOneAndUpdate({nombre}, nuevaCancha, {new: true})
        res.json({
            ok: true, 
            cancha: nuevaCancha,
            msg: "Cancha Actualizada"
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
 * ELIMINAR CANCHA POR NOMBRE
 */

const eliminarCancha = async(req, res = response)=> {
    const {nombre} = req.params;

    try {

        const cancha = await Cancha.findOne({nombre})
        if (!cancha) {
            return res.status(400).json({
                ok: true,
                msg: "No existe la cancha"
            })
        }
        await Cancha.findOneAndDelete({nombre});
        res.json({
            ok: true,
            msg: "Cancha eliminada"
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
    crearCancha,
    getCancha,
    getCanchaPorNombre,
    eliminarCancha,
    actualizarCancha
}
