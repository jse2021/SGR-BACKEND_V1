-- Quitar los únicos globales (por si existen)
DROP INDEX IF EXISTS "v2"."Cliente_dni_key";
DROP INDEX IF EXISTS "v2"."Cliente_email_key";

-- Un único ACTIVO por DNI
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cliente_dni_activo"
ON "v2"."Cliente" (dni)
WHERE estado = 'activo';

-- Un único ACTIVO por Email (si no es null)
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cliente_email_activo"
ON "v2"."Cliente" (email)
WHERE estado = 'activo' AND email IS NOT NULL;
