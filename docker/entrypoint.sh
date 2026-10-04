#!/bin/sh
set -e
# De datamap is een bind-mount van de host; zorg dat de app erin mag schrijven.
chown -R node:node /data
exec su-exec node "$@"
