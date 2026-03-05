# =============================================================================
# Lenclaw Frontend - Multi-stage Docker Build
# Stage 1: Install deps
# Stage 2: Dev target (vite dev server)
# Stage 3: Build React app with Vite
# Stage 4: Serve static assets with nginx
# Target image size: < 25MB
# =============================================================================

# --- Stage 1: Dependencies ---
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# --- Stage 2: Dev (used by docker-compose.dev.yml) ---
FROM deps AS dev

COPY index.html tsconfig.json vite.config.ts tailwind.config.ts ./
COPY src/ src/
COPY public/ public/

EXPOSE 3001
CMD ["npm", "run", "dev"]

# --- Stage 3: Build ---
FROM deps AS builder

COPY index.html tsconfig.json vite.config.ts tailwind.config.ts ./
COPY src/ src/
COPY public/ public/

RUN npm run build

# --- Stage 4: Serve ---
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Use non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
