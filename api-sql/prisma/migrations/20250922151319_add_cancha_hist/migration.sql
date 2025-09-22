-- AlterTable
ALTER TABLE "v2"."Cancha" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'activo',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "v2"."CanchaHist" (
    "id" SERIAL NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "usuarioId" INTEGER,
    "user" TEXT,
    "nombre" TEXT NOT NULL,
    "medidas" TEXT,
    "estado" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanchaHist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanchaHist_canchaId_changedAt_idx" ON "v2"."CanchaHist"("canchaId", "changedAt");

-- AddForeignKey
ALTER TABLE "v2"."CanchaHist" ADD CONSTRAINT "CanchaHist_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "v2"."Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
