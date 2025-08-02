# Dockerfile für Fly.io Deployment
FROM node:18-alpine

# curl für Health Check installieren
RUN apk add --no-cache curl

# Arbeitsverzeichnis setzen
WORKDIR /app

# Package.json und Package-lock.json kopieren
COPY package*.json ./

# Alle Dependencies installieren (inkl. Dev-Dependencies für Build)
RUN npm ci

# Anwendungscode kopieren
COPY . .

# Build der React App
RUN npm run build

# Dev-Dependencies entfernen (nur Production behalten)
RUN npm prune --production

# Port exponieren (muss mit fly.toml übereinstimmen)
EXPOSE 8080

# Health Check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Anwendung starten
CMD ["node", "gateway.js"] 
