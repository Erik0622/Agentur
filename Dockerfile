# Dockerfile für Fly.io Deployment
FROM node:18-alpine
RUN apk add --no-cache curl
WORKDIR /app

# 1) Dependencies
COPY package*.json ./
RUN npm ci

# 2) Anwendungscode + Build
# Quellcode ins Image kopieren (ohne Kommentar am Zeilenende!)
COPY . .
RUN npm run build   # erzeugt /app/dist

# 3) Prod only
RUN npm prune --production

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["node", "voice-agent-server.js"]
