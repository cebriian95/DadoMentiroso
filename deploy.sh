#!/bin/bash
# Genera hash basado en el contenido de css y js
HASH=$(cat style.css dice.css app.js | md5 | cut -c1-8 2>/dev/null || cat style.css dice.css app.js | md5sum | cut -c1-8)

# Inyecta el hash en index.html temporalmente
sed -i.bak "s/style\.css\"/style.css?v=$HASH\"/g" index.html
sed -i.bak "s/dice\.css\"/dice.css?v=$HASH\"/g" index.html
sed -i.bak "s/app\.js\"/app.js?v=$HASH\"/g" index.html

# Build y push
docker buildx build --platform linux/arm64 -t cebriian95/dado-mentiroso_arm --push .

# Restaura el index.html original
mv index.html.bak index.html

echo "Deploy completado con versión: $HASH"