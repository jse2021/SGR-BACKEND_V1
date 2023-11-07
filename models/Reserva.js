const {Schema, model} = require('mongoose')
// Importamos el modelo Configuracion como referencia


const ReservaSchema = Schema({

    cliente: {
        type: String,
        required: true,
        validate: {
          // La regla de validación se usa para comprobar que el dni es válido
          // Puede utilizar una expresión regular para comprobar el formato del dni
          validator: (value) => {
            return /^[0-9]{8}$/.test(value);
          },
          message: "El dni debe tener 8 dígitos",
        },
      },
    nombreCliente:{
      type:String,
    },
    
    apellidoCliente:{
      type:String,
    },
    
    cancha:{
        type: Schema.Types.String,
        upperCase: true,
    },
    
    estado_pago:{
      type: String, 
      required: true,
      upperCase: true,
    },
    
    monto_cancha: {
      type: Number,
      required: true,
    },
    monto_sena: {
      type: Number,
      required: true,
    },

    fechaCopia:{
      type: String,
    },
    
    fecha: {
      type: Date, 
      required: true,
      },

    hora:{
      type: String, 
      required: true
    },
    
    forma_pago:{
      type: String,
      required: true,
      upperCase: true,
    },

    observacion: {
      type: String,
    },

    user: {
      type: String,
      required: true
    },

    configuracion: {
      type: Schema.Types.String,
      ref: "Configuracion",
  }, 
  title: {
    type: String,
  
},
start: {
    type: Date,
  
},
end: {
    type: Date,
  
},
});

ReservaSchema.method('toJSON', function(){
   const {__v, _id,...object} = this.toObject();
   object.id= _id;
   return object;
})

module.exports = model('Reserva', ReservaSchema);


