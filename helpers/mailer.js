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
    from: `"Sistema de Gestión de Reservas" <${process.env.MAIL_USER}>`,
    to: destinatario,
    subject: 'Estado de Reserva de Cancha',
    html: `
      <h2>¡Hola </strong> ${datosReserva.nombre}!</h2>
      <p>Tu reserva ha sido registrada correctamente, adjuntamos información de la misma</p>
      <ul>
        <li><strong>Fecha:</strong> ${datosReserva.fecha}</li>
        <li><strong>Cancha:</strong> ${datosReserva.cancha}</li>
        <li><strong>Hora:</strong> ${datosReserva.hora}</li>
        <li><strong>Estado de Pago:</strong> ${datosReserva.estado}</li>
        <li><strong>Observaciones:</strong> ${datosReserva.observacion}</li>
      </ul>
       <p>Número de Telefono: +54 9 2964473552</p>
      <p>Gracias por usar nuestro sistema.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  enviarCorreoReserva
};
