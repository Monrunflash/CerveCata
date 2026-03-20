#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  cerve-upload.sh
#  Sube un JSON de resultados a S3 y actualiza index.json
#  Uso: ./cerve-upload.sh cata_samuel_2026-03-20.json
#
#  Requiere: aws cli configurado (aws configure)
# ─────────────────────────────────────────────────────────

set -euo pipefail

BUCKET="cervecata.monrunflash.com"          # ← cambia esto
PREFIX="results"            # carpeta dentro del bucket
FILE="${1:-}"

if [[ -z "$FILE" ]]; then
  echo "Uso: $0 <fichero.json>"
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Error: no existe el fichero '$FILE'"
  exit 1
fi

FILENAME=$(basename "$FILE")

echo "📤 Subiendo $FILENAME..."
aws s3 cp "$FILE" "s3://${BUCKET}/${PREFIX}/${FILENAME}" \
  --content-type "application/json" \
  --cache-control "no-cache"

echo "🔄 Actualizando index.json..."

# Descargar index.json actual (si existe)
TMPDIR=$(mktemp -d)
INDEX="$TMPDIR/index.json"
aws s3 cp "s3://${BUCKET}/${PREFIX}/index.json" "$INDEX" 2>/dev/null \
  || echo '{"session":"Cata de Cervezas 🍺","files":[]}' > "$INDEX"

# Añadir el fichero al array si no estaba ya, ordenado
python3 - "$INDEX" "$FILENAME" <<'EOF'
import sys, json
path, name = sys.argv[1], sys.argv[2]
with open(path) as f:
    idx = json.load(f)
files = sorted(set(idx.get('files', []) + [name]))
idx['files'] = files
with open(path, 'w') as f:
    json.dump(idx, f, indent=2, ensure_ascii=False)
print(json.dumps(idx, indent=2, ensure_ascii=False))
EOF

# Subir index.json actualizado
aws s3 cp "$INDEX" "s3://${BUCKET}/${PREFIX}/index.json" \
  --content-type "application/json" \
  --cache-control "no-cache"

rm -rf "$TMPDIR"
echo "✅ Listo. Ficheros en S3:"
aws s3 ls "s3://${BUCKET}/${PREFIX}/" --human-readable
