#!/bin/sh
# Arranque del backend en contenedor: aplica las migraciones pendientes y luego inicia la API.
# Requiere DATABASE_URL en el entorno. Si la migración falla, el contenedor termina con error.
set -eu

./node_modules/.bin/prisma migrate deploy

exec node dist/main
