#!/bin/bash
# Build and serve the production app on a port, in the background.
#   scripts/serve.sh start [port]   scripts/serve.sh stop
PIDFILE=.next-serve.pid
case "$1" in
  stop)
    [ -f $PIDFILE ] && kill "$(cat $PIDFILE)" 2>/dev/null; rm -f $PIDFILE ;;
  start)
    [ -f $PIDFILE ] && kill "$(cat $PIDFILE)" 2>/dev/null
    nohup node node_modules/next/dist/bin/next start -p "${2:-3210}" > .next-serve.log 2>&1 &
    echo $! > $PIDFILE ;;
esac
