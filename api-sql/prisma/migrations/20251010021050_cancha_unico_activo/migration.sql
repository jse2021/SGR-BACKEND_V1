-- Cancha: quitar único global (si existe)
DROP INDEX IF EXISTS "v2"."Cancha_nombre_key";

-- Cancha: permitir duplicados, pero solo UNO ACTIVO por nombre
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cancha_nombre_activo"
ON "v2"."Cancha" (nombre)
WHERE estado = 'activo';

-- (Si también aplicaste el criterio a Cliente, podés incluir en esta misma migrate:)
-- DROP INDEX IF EXISTS "v2"."Cliente_dni_key";
-- DROP INDEX IF EXISTS "v2"."Cliente_email_key";
-- CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cliente_dni_activo"
-- ON "v2"."Cliente" (dni)
-- WHERE estado = 'activo';
-- CREATE UNIQUE INDEX IF NOT EXISTS "uniq_cliente_email_activo"
-- ON "v2"."Cliente" (email)
-- WHERE estado = 'activo' AND email IS NOT NULL;
