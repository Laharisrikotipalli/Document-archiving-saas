# ---------- Stage 1: install dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- Stage 2: runtime image ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# Run as a non-root user for security
RUN addgroup -S archive && adduser -S archive -G archive

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER archive

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
