const {response} = require('express');
const {validationResult} = require('express-validator')
const bcrypt = require('bcryptjs')
const Usuario = require('../models/Usuario')
const {generarJWT} = require('../helpers/jwt')


/**
 * FALTA EL TIPO_USUARIO: TIENE QUE SER ADMINISTRADOR PARA PODER: CREAR, ACTUALIZAR, Y BUSCAR.
 */

let tipoUsuario;

/**
 * LOGIN USUARIO - CON USER - PASSWORD 
 * TERMINADO
 */

const loginUsuario = async(req, res = response) => {
    const {user, password} = req.body;
    try {
        const usuario = await Usuario.findOne({user});
        tipoUsuario = usuario.tipo_usuario;
        console.log({tipoUsuario})
        if (!usuario) {
            return res.status(400).json({
                ok: false,
                msg: "El usuario no existe con el nombre de usuario",
            })
        }

        // CONFIRMAR CLAVES
        const validarPassword = bcrypt.compareSync(password, usuario.password);// compara los password, da true o false
        if (!validarPassword) {
            return res.status(400).json({
                ok: false,
                msg:"Password incorrecto"
            });
        }
        //GENERO JWT
        const token = await generarJWT(usuario.id, usuario.user);
        

        return res.json({
            ok:true,
            msg: "Accedo a calendario",
            user,
            token
        })
        
        
    } catch (error) {
        console.log({error})
        res.status(500).json({
            ok:false,
            msg:"por favor hable con el administrador"
        })
        
    }
}

 const revalidartoken =  async(req, res=response) => {
    const {id, user} = req;

    try {
        const token = await generarJWT(id, user);

        return res.json({
            ok:true,
            id,
            user,
            token
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
        ok: false,
        msg: 'Error al revalidar el token. Hable con el administrador.'
    });
    }
}

/**
 * CREAR NUEVO USUARIO
  */
const crearUsuario = async(req, res = response ) => {

    const {nombre, email, password, user} = req.body;
    
    
    try {

        
          console.log({tipoUsuario})
        if (tipoUsuario === 'Estandar') {
            return res.status(400).json({
                ok: false,
                msg: "Ud. no puede crear usuarios"
            });
        }

        let usuario = await Usuario.findOne({user});
   
        if (usuario) {
            return res.status(400).json({
                ok: false,
                msg: "Nombre de usuario existente en la base de datos",
                uid: usuario.uid,
                name: usuario.user
            })
        }
        usuario = new Usuario(req.body);
        //ENCRIPTAR CLAVE
        const salt = bcrypt.genSaltSync();
        usuario.password = bcrypt.hashSync(password, salt);
        await usuario.save();
        
        // GENERAR JWT
        const token = await generarJWT(usuario.id, usuario.name);
        res.status(201).json({
            ok:true,
            msg: "Usuario creado",
            name: usuario.name,
            email: usuario.email,
            token
        })
        
    } catch (error) {
        console.log({error})
        res.status(500).json({
            ok:false,
            msg:"por favor hable con el administrador"
        })
        
    }
   
}


/**
 * BUSCAR USUARIO - EL FILTRO SE HACE DESDE EL FRONT
  */

const getUsuario = async (req, res = response)=>{
    
  
    // if (tipoUsuario !== 'Administrador') {
    //     return res.status(400).json({
    //         ok: false,
    //         msg: "Ud. no puede buscar usuarios"
    //     });
    // }

    try {
        const usuario = await Usuario.find()
        
       if (!usuario) {
        return  res.status(400).json({
            ok: false,
            msg:'El usuario no existe'
        })
    }
     
        res.json({
            ok: true, 
            usuario,
            msg: "Muestro usuario"
    })
  
    }catch (error) {  
        console.log({error})
        res.status(500).json({
            ok:false,
            msg:"Consulte con el administrador"
        })
    }

}

/**
 * BUSCAR USUARIO POR USER
 */
const getUsuarioPorUser = async(req, res = response) => {
    const {apellido} = req.params;

    try {
   
        const usuario = await Usuario.find({apellido});
        if (!usuario) {
            return  res.status(400).json({
                ok: false,
                msg:'El usuario no existe'
            })
        }
        return res.status(200).json({
            ok: true, 
            usuario,
            msg: "Muestro usuario"
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
 * ACTUALIZAR USUARIO - EL FILTRO SE HACE DESDE EL FRONT
 * ACTUALIZA POR USER
 */

const actualizarUsuario = async (req, res = response)=>{
    const {user} = req.params;

    try {
        // if (tipoUsuario === 'Estandar') {
        //     return res.status(400).json({
        //         ok: false,
        //         msg: "Ud. no puede actualizar usuarios"
        //     });
        // }

        const usuario = await Usuario.findOne({user});
        if (!usuario) {
            return  res.status(400).json({
                ok: false,
                msg:'El usuario no existe en la base de datos'
            })
        }

        const nuevoUsuario = {
            ...req.body
        }
//new:true, significa que va a retorar los datos actualizados
        const usuarioActualizado = await Usuario.findOneAndUpdate({user}, nuevoUsuario, {new: true})
        res.json({
            ok: true, 
            usuario: nuevoUsuario,
            msg: "Usuario Actualizado"
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
 * ELIMINAR USUARIO - EL FILTRO SE HACE DESDE EL FRONT
 */

const eliminarUsuario = async(req, res= response) => {
    
    const {user} = req.params;
    try {
        if (tipoUsuario === 'Estandar') {
            return res.status(400).json({
                ok: false,
                msg: "Ud. no puede eliminar usuarios"
            });
        }
 
            const usuario = await Usuario.findOne({user})
            if (!usuario) {
                return res.status(400).json({
                    ok: false,
                    msg:'Usuario inexistente'
                })
            }
            
            await Usuario.findOneAndDelete({user}); 
            
            res.json({
                ok: true, 
                msg: "Usuario Eliminado"
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
    crearUsuario,
    getUsuario,
    getUsuarioPorUser,
    eliminarUsuario,
    actualizarUsuario,
    loginUsuario,
    revalidartoken
}