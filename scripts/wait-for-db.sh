#!/usr/bin/env bash

set -euo pipefail

host="${1:-localhost}"
port="${2:-5432}"

python3 - <<PY
import socket
import time

host = "${host}"
port = int("${port}")

while True:
    with socket.socket() as sock:
        sock.settimeout(1)
        try:
            sock.connect((host, port))
        except OSError:
            print(f"Waiting for database at {host}:{port}...")
            time.sleep(1)
        else:
            print("Database is ready")
            break
PY
