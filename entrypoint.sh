#!/bin/bash
set -e

# Default PUID and PGID if not provided or empty
PUID=${PUID:-0}
PGID=${PGID:-0}

# Clean up environment variables if they are not numeric
if ! [[ "$PUID" =~ ^[0-9]+$ ]]; then
    PUID=0
fi
if ! [[ "$PGID" =~ ^[0-9]+$ ]]; then
    PGID=0
fi

if [ "$PUID" -ne 0 ] && [ "$PGID" -ne 0 ]; then
    echo "[TransVault Entrypoint] Running as custom user with PUID=$PUID and PGID=$PGID"
    
    # Create group if it doesn't exist
    if ! getent group transvault-group >/dev/null; then
        groupadd -g "$PGID" transvault-group
    fi
    
    # Create user if it doesn't exist
    if ! getent passwd transvault-user >/dev/null; then
        useradd -u "$PUID" -g "$PGID" -d /app -s /sbin/nologin -M transvault-user
    fi
    
    # Add user to DRI/render groups if they exist to support hardware acceleration
    if [ -e /dev/dri ]; then
        # Ensure the transvault-user can access the DRI nodes by opening permissions
        chmod -R 777 /dev/dri 2>/dev/null || true
        
        # Check render GID
        RENDER_DEV="/dev/dri/renderD128"
        if [ ! -e "$RENDER_DEV" ]; then
            RENDER_DEV="/dev/dri/card0"
        fi
        
        if [ -e "$RENDER_DEV" ]; then
            DRI_GID=$(stat -c '%g' "$RENDER_DEV" 2>/dev/null)
            if [ -n "$DRI_GID" ] && [ "$DRI_GID" -ne 0 ]; then
                if ! getent group "$DRI_GID" >/dev/null; then
                    groupadd -g "$DRI_GID" dri-group
                fi
                usermod -aG "$DRI_GID" transvault-user
            fi
        fi
    fi
    
    # Ensure config and workdir are owned by the custom user
    chown -R transvault-user:transvault-group /config /workdir
    
    # Run the application as the custom user using gosu
    exec gosu transvault-user:transvault-group uvicorn backend.app.main:app --host 0.0.0.0 --port 8080
else
    echo "[TransVault Entrypoint] Running as root"
    exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8080
fi
