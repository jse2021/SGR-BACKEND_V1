/*
  Warnings:

  - You are about to drop the column `montoTotal` on the `Reserva` table. All the data in the column will be lost.
  - You are about to drop the `Cancha` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pago` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `monto_cancha` to the `Reserva` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monto_sena` to the `Reserva` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Pago" DROP CONSTRAINT "Pago_reservaId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Reserva" DROP CONSTRAINT "Reserva_canchaId_fkey";

-- AlterTable
ALTER TABLE "public"."Reserva" DROP COLUMN "montoTotal",
ADD COLUMN     "estado_pago" TEXT,
ADD COLUMN     "forma_pago" TEXT,
ADD COLUMN     "monto_cancha" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "monto_sena" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "title" TEXT;

-- DropTable
DROP TABLE "public"."Cancha";

-- DropTable
DROP TABLE "public"."Pago";

-- CreateTable
CREATE TABLE "public"."Configuracion" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_clave_key" ON "public"."Configuracion"("clave");
