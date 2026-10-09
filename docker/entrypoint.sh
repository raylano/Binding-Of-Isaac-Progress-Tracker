#!/bin/sh
set -e
# The data directory is a bind mount from the host; make sure the app may write to it.
chown -R node:node /data
exec su-exec node "$@"
