const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const enviarCorreoReserva = async (destinatario, datosReserva) => {
  console.log('Destinatario:', destinatario); // <-- agrega esto para debug
  const mailOptions = {
    from: `"SGR Reservas" <${process.env.MAIL_USER}>`,
    to: destinatario,
    subject: 'Reserva registrada con éxito',
    html: `
      <h2>¡Hola!</h2>
      <p>Tu reserva ha sido registrada correctamente.</p>
      <ul>
        <li><strong>Fecha:</strong> ${datosReserva.fecha}</li>
        <li><strong>Hora:</strong> ${datosReserva.hora}</li>
        <li><strong>Nombre:</strong> ${datosReserva.nombre}</li>
      </ul>
      <p>Gracias por usar nuestro sistema.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  enviarCorreoReserva
};
