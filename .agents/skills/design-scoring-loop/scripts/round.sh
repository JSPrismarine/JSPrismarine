#!/bin/sh
# Runs the capture half of one round for a served web surface: stops the old server, builds, serves,
# captures the screenshot set and stages it for the judges. Prints the staged directory.
#
#   S=<scratchpad> PORT=<port> BUILD='<build command>' SERVE='<serve command>' round.sh <n>
#
# Run it from the directory the build and serve commands expect. It needs `$S/pw/shoot.mjs` and
# `$S/pw/shots.json` (see the skill's capture step). Round `n` is captured to `$S/rounds/r<n>` and
# staged beside `r<n-1>` when that exists. A failed build stops the round before anything is
# captured, so a half-built surface never reaches a judge. Logs go to `$S/build.log` and
# `$S/serve.log`.
set -eu

n=${1:?usage: round.sh <n>}
: "${S:?set S to the scratchpad directory}" "${PORT:?set PORT}" "${BUILD:?set BUILD}" "${SERVE:?set SERVE}"
stage=$(cd "$(dirname "$0")/../../scoring-loop/scripts" && pwd)/stage.mjs

# By port, never by name: a name pattern also matches the shell running this script.
if command -v fuser >/dev/null 2>&1; then
    fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
else
    lsof -ti "tcp:$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
fi

if ! sh -c "$BUILD" >"$S/build.log" 2>&1; then
    tail -n 30 "$S/build.log" >&2
    echo "round.sh: the build failed, nothing was captured" >&2
    exit 1
fi

nohup sh -c "$SERVE" >"$S/serve.log" 2>&1 </dev/null &
tries=0
until curl -s -o /dev/null "http://localhost:$PORT/"; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
        echo "round.sh: nothing answered on port $PORT, see $S/serve.log" >&2
        exit 1
    fi
    sleep 0.5
done

rm -rf "$S/rounds/r$n"
mkdir -p "$S/rounds"
node "$S/pw/shoot.mjs" "$S/pw/shots.json" "$S/rounds/r$n" >&2

previous="$S/rounds/r$((n - 1))"
if [ -d "$previous" ]; then
    node "$stage" "$S/judge" "$S/rounds/r$n" "$previous"
else
    node "$stage" "$S/judge" "$S/rounds/r$n"
fi
