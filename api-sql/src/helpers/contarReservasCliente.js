const { prisma } = require('../db');
// Cuenta reservas asociadas a un cliente.
// Por defecto solo considera 'activas' (más práctico para operación).
async function contarReservasCliente(clienteId, soloActivas = true) {
  const where = { clienteId: Number(clienteId) };
  if (soloActivas) 
    where.estado = 'activo';  
  return prisma.reserva.count({ where });
}
module.exports = { contarReservasCliente };