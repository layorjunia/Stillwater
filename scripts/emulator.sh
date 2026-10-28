#!/bin/bash
# A REAL Firestore server, locally, for proving the sync code against something that is not a stub.
#
#   scripts/emulator.sh setup    one time: fetch a portable Java runtime into build/tools
#   scripts/emulator.sh start    start Firestore on 127.0.0.1:8080
#   scripts/emulator.sh stop
#
# Everything lives in build/ (git-ignored, inside this project). The `demo-` project id means it can
# never reach a real Firebase project, so it can never touch real data.
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
JRE_DIR="$ROOT/build/tools/jre"
case "${1:-}" in
  setup)
    mkdir -p build/tools build/tmp
    [ -d "$JRE_DIR" ] && { echo "Java runtime already in build/tools"; exit 0; }
    curl -sL --max-time 300 -o build/tools/jre.tar.gz \
      "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse" || exit 1
    mkdir -p "$JRE_DIR" && tar -xzf build/tools/jre.tar.gz -C "$JRE_DIR" && rm -f build/tools/jre.tar.gz
    echo "Java runtime ready: $(find "$JRE_DIR" -name java -path '*bin*' | head -1)"
    ;;
  start)
    JAVA="$(find "$JRE_DIR" -type f -name java -path '*bin*' 2>/dev/null | head -1)"
    [ -n "$JAVA" ] || { echo "No Java runtime yet — run: scripts/emulator.sh setup"; exit 1; }
    export JAVA_HOME="$(dirname "$(dirname "$JAVA")")"
    export PATH="$JAVA_HOME/bin:$PATH"
    export FIREBASE_EMULATORS_PATH="$ROOT/build/tools/emulators"
    mkdir -p build/tmp build/logs "$FIREBASE_EMULATORS_PATH"
    cat > build/tmp/firebase.json <<'JSON'
{ "emulators": { "firestore": { "host": "127.0.0.1", "port": 8080 }, "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
    # The emulator writes firebase-debug.log / firestore-debug.log into the folder it starts in, so start it
    # in build/logs and the project root stays clean.
    # The subshell has its own redirect so a caller piping this script's output is not held open by it.
    ( cd build/logs && exec nohup firebase emulators:start --only firestore --project demo-stillwater \
        --config "$ROOT/build/tmp/firebase.json" ) > build/tmp/emulator.log 2>&1 &
    echo $! > build/tmp/emulator.pid
    for i in $(seq 1 90); do
      curl -s -o /dev/null http://127.0.0.1:8080/ && { echo "Firestore emulator up on 127.0.0.1:8080"; exit 0; }
      sleep 2
    done
    echo "emulator did not start — see build/tmp/emulator.log"; exit 1
    ;;
  stop)
    # By recorded process id, not by matching command-line text (that can hit the shell that called this).
    if [ -f build/tmp/emulator.pid ]; then
      PID="$(cat build/tmp/emulator.pid)"
      pkill -P "$PID" 2>/dev/null; kill "$PID" 2>/dev/null; rm -f build/tmp/emulator.pid
    fi
    # The Java server can outlive its parent; its jar name is specific to it.
    pkill -f "[c]loud-firestore-emulator" 2>/dev/null
    echo "stopped"
    ;;
  *) sed -n '2,10p' "$0" ;;
esac
