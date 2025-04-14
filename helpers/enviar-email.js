const nodemailer = require("nodemailer");

const enviarEmailReserva = async (correoDestino, datosReserva) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,       // Tu email
      pass: process.env.MAIL_PASSWORD    // Contraseña o app password
    }
  });

  const { nombreCliente, fecha, hora } = datosReserva;

  const mailOptions = {
    from: `"Gestión de Reservas" <${process.env.MAIL_USER}>`,
    to: correoDestino,
    subject: "Confirmación de reserva",
    html: `
      <h3>Hola ${nombreCliente},</h3>
      <p>Tu reserva ha sido confirmada:</p>
      <ul>
        <li><strong>Servicio:</strong> ${servicio}</li>
        <li><strong>Fecha:</strong> ${fecha}</li>
        <li><strong>Hora:</strong> ${hora}</li>
      </ul>
      <p>¡Gracias por elegirnos!</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  enviarEmailReserva
};
