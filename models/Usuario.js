 const {Schema, model} = require('mongoose')

 const UsuarioSchema = Schema({
    nombre: {
        type: String, 
        required: true,
    },
    apellido: {
        type: String, 
        required: true,
    },
    celular: {
        type: Number, 
        required: true,
    },
    user: {
        type: String, 
        required: true,
        unique: true
    },
    tipo_usuario: {
        type: String, 
        required: true,
    },
    email: {
        type: String, 
        required: true,
    },
    password: {
        type: String, 
        required: true
    }
 });
 UsuarioSchema.method('toJSON', function(){
    const {__v, _id,...object} = this.toObject();
    object.id= _id;
    return object;
 })
 
 module.exports = model('Usuario', UsuarioSchema);

