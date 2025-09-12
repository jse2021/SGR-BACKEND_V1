-- CreateTable
CREATE TABLE "public"."ConfiguracionHist" (
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

-- CreateIndex
CREATE INDEX "ConfiguracionHist_canchaId_valid_from_idx" ON "public"."ConfiguracionHist"("canchaId", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionHist_canchaId_version_key" ON "public"."ConfiguracionHist"("canchaId", "version");

-- AddForeignKey
ALTER TABLE "public"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "public"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConfiguracionHist" ADD CONSTRAINT "ConfiguracionHist_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
