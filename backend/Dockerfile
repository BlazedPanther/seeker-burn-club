FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDeps for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (includes migrate.ts via build script)
RUN npm run build

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy only the compiled output — no source code in prod
COPY --from=builder /app/dist ./dist

# Fix ownership
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

# Run migrations separately — if migration fails, the container exits immediately
# instead of silently restarting the server in a loop.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/server.js"]
