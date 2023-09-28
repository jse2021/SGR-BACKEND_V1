const {Schema, model} = require('mongoose')

const CanchaSchema = Schema({
    nombre: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    medidas: {
        type: String,
        required: true,
        uppercase: true
    },
   
})

CanchaSchema.method('toJSON', function(){
    const {__v, _id,...object} = this.toObject();
    object.id= _id;
    return object;
 })
module.exports = model('Cancha', CanchaSchema);