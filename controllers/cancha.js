const {response} = require('express')
const {validationResult} = require('express-validator')
const Cancha = require('../models/Cancha')
//---------------------------------------------------------------------------------------------
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
    //---------------------------------------------------------------------------------------------
    /**
     * CONSULTA TODAS LAS CANCHAS
     * TRAE TODAS, LUEGO EN EL FRONT APLICAMOS FILTRO
     */
    
    const buscarCancha = async (req, res = response) => {
      const { termino } = req.params;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 5;
      const skip = (page - 1) * limit;
    
      try {
        const regex = new RegExp(termino, "i"); // 'i' para que no distinga mayúsculas/minúsculas
      const [canchas, total] = await Promise.all([
            Cancha.find({
              $or: [{ nombre: regex }, { medidas: regex }],
            })
              .skip(skip)
              .limit(limit),
            Cancha.countDocuments({
              $or: [{ nombre: regex }, { medidas: regex }],
            }),
          ]);
          console.log(canchas)
         res.json({
          ok: true,
          canchas,
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          msg: "Canchas encontrados",
        });
      } catch (error) {
         
        console.log({ error });
        res.status(500).json({
          ok: false,
          msg: "Consulte con el administrador",
        });
      }
    };

//---------------------------------------------------------------------------------------------
/**
 * ACTUALIZAR CANCHAS
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
//---------------------------------------------------------------------------------------------
/**
 * ELIMINAR CANCHA
 */

const eliminarCancha = async(req, res = response)=> {
   const canchaId = req.params.id;
  console.log("Backend: ", canchaId);

 try {
    const cancha = await Cancha.findById(canchaId);
    if (!cancha) {
      return res.status(404).json({
        ok: false,
        msg: "Cancha inexistente",
      });
    }

    await Cancha.findByIdAndDelete(canchaId);
    
    res.json({
      ok: true,
      msg:`la cancha ${cancha.nombre} fue eliminada`
    });
  } catch (error) {
    console.log({ error });
    res.status(500).json({
      ok: false,
      msg: "Consulte con el administrador",
    });
  }
};



module.exports = {
    crearCancha,
   buscarCancha,
    eliminarCancha,
    actualizarCancha
}
