# =============================================================================
# Lenclaw Frontend - Multi-stage Docker Build
# Stage 1: Build React app with Vite
# Stage 2: Serve static assets with nginx
# Target image size: < 25MB
# =============================================================================

# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install dependencies (ci = clean install, deterministic)
RUN npm ci --ignore-scripts

# Copy source code
COPY index.html tsconfig.json vite.config.ts tailwind.config.ts ./
COPY src/ src/
COPY public/ public/

# Build for production
RUN npm run build

# --- Stage 2: Serve ---
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
