-- AlterTable
ALTER TABLE "v2"."Configuracion" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "v2"."ConfiguracionHist" (
    "id" SERIAL NOT NULL,
    "configuracionId" INTEGER NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "user" TEXT,
    "monto_cancha" DECIMAL(12,2) NOT NULL,
    "monto_sena" DECIMAL(12,2) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionHist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracionHist_configuracionId_changedAt_idx" ON "v2"."ConfiguracionHist"("configuracionId", "changedAt");

-- CreateIndex
CREATE INDEX "ConfiguracionHist_canchaId_changedAt_idx" ON "v2"."ConfiguracionHist"("canchaId", "changedAt");

-- AddForeignKey
ALTER TABLE "v2"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_configuracionId_fkey" FOREIGN KEY ("configuracionId") REFERENCES "v2"."Configuracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "v2"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
