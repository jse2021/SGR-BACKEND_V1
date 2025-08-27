-- CreateTable
CREATE TABLE "public"."Configuracion" (
    "id" SERIAL NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "monto_cancha" DECIMAL(12,2) NOT NULL,
    "monto_sena" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_canchaId_key" ON "public"."Configuracion"("canchaId");

-- AddForeignKey
ALTER TABLE "public"."Configuracion" ADD CONSTRAINT "Configuracion_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "public"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
