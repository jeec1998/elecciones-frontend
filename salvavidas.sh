#!/usr/bin/env bash
# ==============================================================================
# SALVAVIDAS — elecciones-frontend (Rollback inmediato de código y rebuild)
# ==============================================================================
set -euo pipefail

CMD="${1:-help}"

case "$CMD" in
  rollback-code)
    echo "🛟 Revirtiendo cambios locales en src/ al último commit estable de Git..."
    git checkout -- src/
    npm run build
    echo "✅ Frontend restaurado y compilado con éxito."
    ;;
  verify)
    echo "🔍 Verificando linter y builds (full + digitador)..."
    npm run lint
    npm run build:digitador
    npm run build
    echo "✅ Frontend verificado sin errores."
    ;;
  *)
    echo "Uso de Salvavidas (elecciones-frontend):"
    echo "  ./salvavidas.sh verify         -> Verifica que lint y builds (full + digitador) pasen en verde"
    echo "  ./salvavidas.sh rollback-code  -> Revierte src/ al último commit estable y recompila dist/"
    ;;
esac
