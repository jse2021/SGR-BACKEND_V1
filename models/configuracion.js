const { Schema, model } = require("mongoose");

const ConfiguracionSchema = Schema({
  cancha: {
    type: Schema.Types.ObjectId,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  monto_cancha: {
    type: Number,
    required: true,
  },

  monto_sena: {
    type: Number,
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now(),
    description: "La fecha y hora en que se creó el documento.",
  },
  updatedAt: {
    type: Date,
    description: "La fecha y hora en que se actualizó el documento.",
  },
  estado: {
    type: String,
    default: "activo",
    index: true,
    uppercase: true,
    description: "El estado del documento.",
  },
});

ConfiguracionSchema.method("toJSON", function () {
  const { __v, _id, ...object } = this.toObject();
  object.id = _id;
  return object;
});

module.exports = model("Configuracion", ConfiguracionSchema);

// sena_cancha: {
//     type: String,
//     // required: true,
// },
// fecha_modif: {
//     type: Date,
//     createdAt: Date
//     // required: true
// }
