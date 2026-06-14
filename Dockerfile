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

# Install system dependencies including FFmpeg, Intel Media Drivers and VA-API
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    intel-media-driver \
    va-driver-all \
    libva-drm2 \
    libva2 \
    vainfo \
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

# Expose port
EXPOSE 8080

# Environment variables for Intel QuickSync / VAAPI
ENV LIBVA_DRIVER_NAME=iHD

# Run App
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
