/*
  Warnings:

  - Added the required column `version` to the `ClienteHist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "v2"."ClienteHist" ADD COLUMN     "version" INTEGER NOT NULL;
