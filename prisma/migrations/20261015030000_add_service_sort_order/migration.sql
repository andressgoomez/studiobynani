ALTER TABLE "Service" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Orden visible de hoy: activos primero, después categoría y nombre.
UPDATE "Service"
SET "sortOrder" = (
  SELECT COUNT(*)
  FROM "Service" AS "earlier"
  WHERE "earlier"."active" > "Service"."active"
    OR ("earlier"."active" = "Service"."active" AND "earlier"."category" < "Service"."category")
    OR ("earlier"."active" = "Service"."active" AND "earlier"."category" = "Service"."category" AND "earlier"."name" < "Service"."name")
    OR ("earlier"."active" = "Service"."active" AND "earlier"."category" = "Service"."category" AND "earlier"."name" = "Service"."name" AND "earlier"."id" < "Service"."id")
);
