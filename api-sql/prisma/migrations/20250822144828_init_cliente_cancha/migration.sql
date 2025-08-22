/*
  Warnings:

  - You are about to drop the column `Medidas` on the `Cancha` table. All the data in the column will be lost.
  - You are about to drop the column `Nombre` on the `Cancha` table. All the data in the column will be lost.
  - You are about to drop the `Configuracion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Reserva` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[nombre]` on the table `Cancha` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `medidas` to the `Cancha` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nombre` to the `Cancha` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Reserva" DROP CONSTRAINT "Reserva_clienteId_fkey";

-- DropIndex
DROP INDEX "public"."Cancha_Nombre_key";

-- AlterTable
ALTER TABLE "public"."Cancha" DROP COLUMN "Medidas",
DROP COLUMN "Nombre",
ADD COLUMN     "medidas" TEXT NOT NULL,
ADD COLUMN     "nombre" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."Configuracion";

-- DropTable
DROP TABLE "public"."Reserva";

-- CreateIndex
CREATE UNIQUE INDEX "Cancha_nombre_key" ON "public"."Cancha"("nombre");
