#!/bin/bash
WORKER_FILE="node_modules/metro/src/DeltaBundler/WorkerFarm.js"
if [ -f "$WORKER_FILE" ]; then
  if ! grep -q "if (false)" "$WORKER_FILE" 2>/dev/null; then
    sed -i 's/^    if (this\._config\.maxWorkers > 9999)/    if (false)/' "$WORKER_FILE" 2>/dev/null
    echo "Patched WorkerFarm.js: forced in-process worker mode (EPIPE fix)"
  else
    echo "WorkerFarm.js already patched"
  fi
fi
