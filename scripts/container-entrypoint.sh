#!/bin/sh
set -eu

# Hosts may mount a new persistent volume as root. Change ownership only inside
# the application's data directory, then drop privileges before starting Python.
if [ "$(id -u)" = "0" ]; then
    REHEARSAL_STATE_DIR=$(realpath -m -- "${REHEARSAL_STATE_DIR:-/data/rehearsal}")
    export REHEARSAL_STATE_DIR
    case "$REHEARSAL_STATE_DIR" in
        /data/rehearsal|/data/rehearsal/*) ;;
        *) printf '%s\n' 'The container state directory must be /data/rehearsal or a child directory.' >&2; exit 1 ;;
    esac
    mkdir -p "$REHEARSAL_STATE_DIR"
    chown -R rehearsal:rehearsal "$REHEARSAL_STATE_DIR"
    exec gosu rehearsal "$@"
fi

exec "$@"
