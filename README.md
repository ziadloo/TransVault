# TransVault 🎬🛡️

**TransVault** is a self-hosted, user-friendly video transcoding and optimization suite designed specifically for home media servers running **TrueNAS Scale**. 

Instead of immediately overwriting your movies (like Tdarr or FileFlows) and risking quality loss or file corruption, TransVault stages transcoded files in your library and moves your originals to a secure **Vault** folder. You review the visual differences, file size savings, and audio/subtitle tracks in a gorgeous web interface, then explicitly approve the swap (which deletes the original) or reject it (which rolls back the library instantly).

---

## 🚀 Key Features

* **🔒 Dual-Stage "Safe-Staging" Pipeline**: Never lose a movie again. Swap and verify transcodes before deleting originals.
* **⚡ Intel GPU QuickSync (QSV) & AV1 Hardware Encoding**: Fully leverages Intel Arc, Xe, and Core processors for blazing-fast hardware-accelerated H.264, HEVC, and next-gen AV1 encoding.
* **🌱 Open Source AV1 Software fallback**: Fully supports SVT-AV1 (`libsvtav1`) out of the box.
* **🧠 Smart Profile Compositor**: No confusing node-based flowchart programming. Assign closest matching profiles dynamically using simple rules (based on resolution, HDR, and original codec).
* **🔊 Audio & Subtitle Whitelisting**: Define track filters to keep only preferred languages, drop commentary, and strip bulky image subtitles (PGS) to save massive space.
* **📅 Quiet Hours Scheduler**: Restrict transcoding to run only during specific windows (e.g. overnight 12 AM - 8 AM) to avoid disrupting Plex or Jellyfin playback.
* **🛑 Storage Safety Guardrail**: Automatically pauses transcode queues if library disk space falls below a safe limit (default 50 GB).

---

## 🛠️ Architecture

* **Frontend**: React, TypeScript, TailwindCSS v4.0, Lucide icons.
* **Backend**: Python (FastAPI), SQLite (using WAL mode for concurrent write operations).
* **Workloads**: Multi-threaded Python queue (RQ-style but DB-backed for single-container deployment) calling custom `ffprobe` / `ffmpeg` sub-processes.

---

## 🐳 Quick Start with Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  transvault:
    image: transvault/transvault:latest
    container_name: transvault
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
      - DATABASE_PATH=/config/transvault.db
      - LIBVA_DRIVER_NAME=iHD # Force Intel Media Driver
    volumes:
      - ./config:/config           # DB and configuration path
      - /mnt/tank/media/movies:/library # Movies directory
      - /mnt/tank/media/vault:/vault   # Vault path (original preservation folder)
      - /mnt/tank/scratch:/workdir     # SSD temp workspace for transcoding jobs
    devices:
      - /dev/dri:/dev/dri           # Intel QuickSync / VAAPI Passthrough
```

Run the container:
```bash
docker compose up -d
```
Access the Web GUI at `http://YOUR-SERVER-IP:8080`.

---

## 📦 TrueNAS Scale Installation (Electric Eel and newer)

TrueNAS Scale (version 24.10 "Electric Eel" and newer) supports native Docker Compose applications. 

1. Go to **Apps** in your TrueNAS Scale web console.
2. Click **Discover Apps** and search for **Custom App** (or use Compose).
3. Paste the contents of the `docker-compose.yml` shown above.
4. Mount your datasets correctly:
   - `/library`: Point to your primary movies pool.
   - `/vault`: Point to a directory on your hard drive pool to store originals awaiting approval.
   - `/workdir`: **Important:** Map this to an SSD dataset to prevent heavy HDD thrashing during active transcode writes.
5. Under GPU Settings, ensure that your Intel GPU (Render device `/dev/dri`) is allocated to the application container.

---

## 🧑‍💻 Developer Instructions

### Prerequisites
* Python 3.10+
* Node.js 18+
* FFmpeg with Intel QSV drivers (optional for dev, software SVT-AV1 will fallback automatically)

### Running Backend (Development)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_PATH=./dev.db LIBRARY_DIR=../library VAULT_DIR=../vault WORK_DIR=../workdir uvicorn app.main:app --reload --port 8080
```

### Running Frontend (Development)
```bash
cd frontend
npm install
npm run dev
```
The dev server will run on `http://localhost:5173` and proxy API calls to the backend on `http://localhost:8080`.

---

## 📄 License
This project is licensed under the MIT License.
