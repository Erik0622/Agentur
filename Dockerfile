# Dockerfile für Fly.io Deployment
FROM node:18-alpine
# System-Tools für Builds (native Modules) und Healthchecks
RUN apk add --no-cache curl python3 make g++
WORKDIR /app

# 1) Dependencies
COPY package*.json ./
# CI-optimiert: keine Audit/Fund-Abfragen, stabilere Netzwerk-Settings
ENV CI=true
RUN npm ci --no-audit --no-fund

# 2) Anwendungscode + Build
# Quellcode ins Image kopieren (ohne Kommentar am Zeilenende!)
COPY . .
RUN npm run build   # erzeugt /app/dist

# 3) Prod only
RUN npm prune --production

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run the gateway server which uses /api/* (Deepgram/Gemini/Azure)
CMD ["node", "gateway.js"]
