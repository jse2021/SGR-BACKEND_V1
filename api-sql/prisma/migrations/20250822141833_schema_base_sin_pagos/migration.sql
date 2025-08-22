-- CreateTable
CREATE TABLE "public"."Cancha" (
    "id" SERIAL NOT NULL,
    "Nombre" TEXT NOT NULL,
    "Medidas" TEXT NOT NULL,

    CONSTRAINT "Cancha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cancha_Nombre_key" ON "public"."Cancha"("Nombre");
