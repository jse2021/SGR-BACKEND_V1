-- CreateTable
CREATE TABLE "v2"."Cliente" (
    "id" SERIAL NOT NULL,
    "dni" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."ClienteHist" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "dni" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "accion" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "user" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteHist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."Cancha" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "medidas" TEXT NOT NULL,

    CONSTRAINT "Cancha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."Configuracion" (
    "id" SERIAL NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "monto_cancha" DECIMAL(12,2) NOT NULL,
    "monto_sena" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."Usuario" (
    "id" SERIAL NOT NULL,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "celular" TEXT NOT NULL,
    "email" TEXT,
    "tipo_usuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."ConfiguracionHist" (
    "id" SERIAL NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "monto_cancha" DECIMAL(12,2) NOT NULL,
    "monto_sena" DECIMAL(12,2) NOT NULL,
    "version" INTEGER NOT NULL,
    "changedById" INTEGER,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),

    CONSTRAINT "ConfiguracionHist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2"."Reserva" (
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
CREATE TABLE "v2"."ReservaHist" (
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
CREATE UNIQUE INDEX "Cliente_dni_key" ON "v2"."Cliente"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_email_key" ON "v2"."Cliente"("email");

-- CreateIndex
CREATE INDEX "Cliente_apellido_nombre_idx" ON "v2"."Cliente"("apellido", "nombre");

-- CreateIndex
CREATE INDEX "ClienteHist_clienteId_changedAt_idx" ON "v2"."ClienteHist"("clienteId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cancha_nombre_key" ON "v2"."Cancha"("nombre");

-- CreateIndex
CREATE INDEX "Cancha_nombre_idx" ON "v2"."Cancha"("nombre");

-- CreateIndex
CREATE INDEX "Cancha_medidas_idx" ON "v2"."Cancha"("medidas");

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_canchaId_key" ON "v2"."Configuracion"("canchaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_user_key" ON "v2"."Usuario"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "v2"."Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_apellido_nombre_idx" ON "v2"."Usuario"("apellido", "nombre");

-- CreateIndex
CREATE INDEX "Usuario_user_idx" ON "v2"."Usuario"("user");

-- CreateIndex
CREATE INDEX "ConfiguracionHist_canchaId_valid_from_idx" ON "v2"."ConfiguracionHist"("canchaId", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionHist_canchaId_version_key" ON "v2"."ConfiguracionHist"("canchaId", "version");

-- CreateIndex
CREATE INDEX "Reserva_canchaId_fechaCopia_hora_idx" ON "v2"."Reserva"("canchaId", "fechaCopia", "hora");

-- CreateIndex
CREATE INDEX "Reserva_fechaCopia_estado_idx" ON "v2"."Reserva"("fechaCopia", "estado");

-- CreateIndex
CREATE INDEX "Reserva_clienteId_fecha_idx" ON "v2"."Reserva"("clienteId", "fecha");

-- CreateIndex
CREATE INDEX "ReservaHist_reservaId_version_idx" ON "v2"."ReservaHist"("reservaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaHist_reservaId_version_key" ON "v2"."ReservaHist"("reservaId", "version");

-- AddForeignKey
ALTER TABLE "v2"."Configuracion" ADD CONSTRAINT "Configuracion_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "v2"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "v2"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "v2"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."Reserva" ADD CONSTRAINT "Reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "v2"."Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."Reserva" ADD CONSTRAINT "Reserva_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "v2"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "v2"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."ReservaHist" ADD CONSTRAINT "ReservaHist_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "v2"."Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."ReservaHist" ADD CONSTRAINT "ReservaHist_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "v2"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
