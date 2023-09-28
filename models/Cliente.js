const {Schema, model} = require('mongoose');

const ClienteSchema = Schema({
    dni : {
        type: String,
        required: true,
        unique: true,
        validate: {
            // La regla de validación se usa para comprobar que el dni es válido
            // Puede utilizar una expresión regular para comprobar el formato del dni
            validator: (value) => {
              return /^[0-9]{8}$/.test(value);
            },
            message: "El dni debe tener 8 dígitos",
          },
    },
    nombre: {
        type: String,
        required: true,
        uppercase: true
    },
    apellido: {
        type: String,
        uppercase: true
    },
    email: {
        type: String, 
        required: true,
        unique: true,
        uppercase: true
    },
    celular: {
        type: Number, 
        required: true,
    }

})

ClienteSchema.method('toJSON', function(){
    const {__v, _id,...object} = this.toObject();
    object.id= _id;
    return object;
 })

module.exports = model('Cliente', ClienteSchema);

