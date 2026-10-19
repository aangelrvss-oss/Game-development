#!/usr/bin/env bash
# Instala Blender como módulo de Python (bpy) en un entorno aparte, fuera del repositorio.
# Probado en Linux x86_64 con Python 3.13 y bpy 5.2.2 (PyPI). No necesita la aplicación de Blender ni GPU.
# Uso: bash assets-src/blender/setup.sh [ruta-del-entorno]   (por defecto ~/blender-venv)
set -euo pipefail
VENV="${1:-$HOME/blender-venv}"
PY="${PYTHON:-python3.13}"
if command -v uv >/dev/null 2>&1; then
  uv venv -q --python "$(command -v "$PY")" "$VENV"
  VIRTUAL_ENV="$VENV" uv pip install -q bpy==5.2.2
else
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -q bpy==5.2.2
fi
"$VENV/bin/python" -c "import bpy; print('bpy', bpy.app.version_string)"
