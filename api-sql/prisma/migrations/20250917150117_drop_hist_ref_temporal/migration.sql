/*
  Warnings:

  - You are about to drop the `ConfiguracionHist` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "v2"."ConfiguracionHist" DROP CONSTRAINT "ConfiguracionHist_canchaId_fkey";

-- DropForeignKey
ALTER TABLE "v2"."ConfiguracionHist" DROP CONSTRAINT "ConfiguracionHist_changedById_fkey";

-- AlterTable
ALTER TABLE "v2"."Usuario" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'activo';

-- DropTable
DROP TABLE "v2"."ConfiguracionHist";

-- CreateTable
CREATE TABLE "v2"."UsuarioHist" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "actorId" INTEGER,
    "user" TEXT,
    "userLogin" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "celular" TEXT,
    "email" TEXT,
    "tipo_usuario" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioHist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsuarioHist_usuarioId_changedAt_idx" ON "v2"."UsuarioHist"("usuarioId", "changedAt");
