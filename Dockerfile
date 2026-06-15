# --- STAGE 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- STAGE 2: Build Backend & Final Image ---
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies, enable non-free, add Jellyfin repository for hardware accelerated ffmpeg (oneVPL)
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/g' /etc/apt/sources.list.d/debian.sources; \
    fi && \
    if [ -f /etc/apt/sources.list ]; then \
        sed -i 's/main/main contrib non-free non-free-firmware/g' /etc/apt/sources.list; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
    gnupg curl ca-certificates && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://repo.jellyfin.org/jellyfin_team.gpg.key | gpg --dearmor -o /etc/apt/keyrings/jellyfin.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/jellyfin.gpg] https://repo.jellyfin.org/debian bookworm main" > /etc/apt/sources.list.d/jellyfin.list && \
    apt-get update && \
    (apt-get install -y --no-install-recommends jellyfin-ffmpeg7 || apt-get install -y --no-install-recommends jellyfin-ffmpeg6) && \
    apt-get install -y --no-install-recommends \
    gosu \
    intel-media-va-driver-non-free \
    va-driver-all \
    libva-drm2 \
    libva2 \
    vainfo \
    && ln -sf /usr/lib/jellyfin-ffmpeg/ffmpeg /usr/bin/ffmpeg \
    && ln -sf /usr/lib/jellyfin-ffmpeg/ffprobe /usr/bin/ffprobe \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /library /vault /workdir /config

# Copy backend app
COPY backend/app/ /app/backend/app/

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 8080

# Environment variables for Intel QuickSync / VAAPI
ENV LIBVA_DRIVER_NAME=iHD

# Run App
ENTRYPOINT ["/app/entrypoint.sh"]
