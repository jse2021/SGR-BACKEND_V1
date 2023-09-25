const {response} = require('express')
const {validationResult} = require('express-validator')

const validarCampos = (req, res = response, next) => {
    
    // MANEJO DE ERRORES
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({
            ok:false,
            errors: errors.mapped()
        });
    }

//si no hay error llamo a next
next();
}

module.exports = {
    validarCampos
}