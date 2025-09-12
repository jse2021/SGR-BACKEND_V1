-- CreateTable
CREATE TABLE "public"."Reserva" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "estado_pago" TEXT NOT NULL,
    "forma_pago" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "monto_cancha" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monto_sena" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL,
    "fechaCopia" DATE NOT NULL,
    "hora" TEXT NOT NULL,
    "title" TEXT,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "nombreCliente" TEXT NOT NULL,
    "apellidoCliente" TEXT NOT NULL,
    "user" TEXT,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReservaHist" (
    "id" SERIAL NOT NULL,
    "reservaId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "changedById" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "estado_pago" TEXT NOT NULL,
    "forma_pago" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "monto_cancha" DECIMAL(12,2) NOT NULL,
    "monto_sena" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "fechaCopia" DATE NOT NULL,
    "hora" TEXT NOT NULL,
    "title" TEXT,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "nombreCliente" TEXT NOT NULL,
    "apellidoCliente" TEXT NOT NULL,
    "user" TEXT,
    "observacion" TEXT,

    CONSTRAINT "ReservaHist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reserva_canchaId_fechaCopia_hora_idx" ON "public"."Reserva"("canchaId", "fechaCopia", "hora");

-- CreateIndex
CREATE INDEX "Reserva_fechaCopia_estado_idx" ON "public"."Reserva"("fechaCopia", "estado");

-- CreateIndex
CREATE INDEX "Reserva_clienteId_fecha_idx" ON "public"."Reserva"("clienteId", "fecha");

-- CreateIndex
CREATE INDEX "ReservaHist_reservaId_version_idx" ON "public"."ReservaHist"("reservaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaHist_reservaId_version_key" ON "public"."ReservaHist"("reservaId", "version");

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "public"."Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "public"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReservaHist" ADD CONSTRAINT "ReservaHist_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "public"."Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReservaHist" ADD CONSTRAINT "ReservaHist_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Evita dos reservas activas en el mismo slot (cancha + fecha + hora)
CREATE UNIQUE INDEX IF NOT EXISTS "reserva_slot_activo_unique"
ON "Reserva" ("canchaId", "fechaCopia", "hora")
WHERE "estado" = 'activo';
