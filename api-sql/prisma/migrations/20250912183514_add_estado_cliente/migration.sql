/*
  Warnings:

  - Added the required column `estado` to the `ClienteHist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "v2"."Cliente" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'activo';

-- AlterTable
ALTER TABLE "v2"."ClienteHist" ADD COLUMN     "estado" TEXT NOT NULL;
