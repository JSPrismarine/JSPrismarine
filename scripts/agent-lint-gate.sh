#!/bin/sh
# Starts the agent lint gate (agent-lint-gate.mts) only for a hook event it can act on.
#
# The PreToolUse hook fires on every shell command an agent runs, and starting Node for each one
# costs most of a second on a loaded machine. The gate only acts on a command that runs
# `git commit`, so a PreToolUse event whose payload never says `commit` ends here. Every other
# event, such as Stop, goes to the gate unchanged.
input=$(cat)
case $input in
*'"PreToolUse"'*)
    case $input in
    *commit*) ;;
    *) exit 0 ;;
    esac
    ;;
esac
printf '%s' "$input" | exec node "$(dirname "$0")/agent-lint-gate.mts"
