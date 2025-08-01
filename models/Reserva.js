const { Schema, model } = require("mongoose");

const ReservaSchema = Schema({
  cliente: {
    type: String,
    required: true,
    index: true,
    validate: {
      // La regla de validación se usa para comprobar que el dni es válido

      validator: (value) => {
        return /^[0-9]{8}$/.test(value);
      },
      message: "El dni debe tener 8 dígitos",
    },
  },
  nombreCliente: {
    type: String,
  },

  apellidoCliente: {
    type: String,
  },

  cancha: {
    type: Schema.Types.String,
    upperCase: true,
    index: true,
  },

  estado_pago: {
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

  fechaCopia: {
    type: String,
    index: true,
  },

  fecha: {
    type: Date,
    required: true,
    index: true,
  },

  hora: {
    type: String,
    required: true,
  },

  forma_pago: {
    type: String,
    required: true,
    upperCase: true,
  },

  observacion: {
    type: String,
  },
  estado: {
    type: String,
    enum: ["activo", "inactivo"],
    default: "activo",
    index: true,
  },

  user: {
    type: String,
    required: true,
    index: true,
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

ReservaSchema.method("toJSON", function () {
  const { __v, _id, ...object } = this.toObject();
  object.id = _id;
  return object;
});

module.exports = model("Reserva", ReservaSchema);
