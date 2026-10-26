#!/bin/sh
set -e
# Bind-mounted data folders are often created by Docker as root.
# Fix ownership, then run the app as the unprivileged "node" user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec su node -s /bin/sh -c 'exec "$0" "$@"' -- "$@"
fi
exec "$@"
