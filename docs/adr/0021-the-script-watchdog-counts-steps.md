# The script watchdog counts steps, and scripts are part of replay

Status: accepted

BDS stops or warns about a script by wall-clock time: `script-watchdog-hang-threshold`,
`script-watchdog-spike-threshold` and `script-watchdog-slow-threshold` are milliseconds.
[ADR 0009](0009-external-inputs-enter-once-per-tick.md) forbids reading the clock inside a tick,
and [ADR 0006](0006-replay-determinism-contract.md) requires a replay to reproduce a session. A
watchdog on the wall clock would stop a script at a different instruction in a replay, or not stop
it at all.

The watchdog counts work. QuickJS calls its interrupt handler once every 10,000 of its internal
polls, which it takes at backward jumps and calls. The host counts those handler calls, which this
ADR calls steps, and charges them to a budget for each callback and for each tick. The research
spike ran the same program to exactly 400 steps on every run. A script that runs out of budget is terminated as BDS terminates one: the callback throws, and
`system.beforeEvents.watchdogTerminate` decides whether the runtime keeps going. The same script
stops at the same step every time it runs. Memory works the same way: the engine's allocation
limit in bytes stands in for `script-watchdog-memory-limit`, and reaching it saves the world and
shuts it down, as BDS does. A stack overflow is the third critical case. BDS treats it as critical
even when the script catches it, and with `script-watchdog-enable-shutdown` on, which is the
default, it shuts the server down. JSP does the same, with the stack limit set in bytes.

The BDS millisecond settings keep their names, and the host converts each one to a step budget
with a documented ratio. The wall clock produces warnings only, such as BDS's slow-script warning,
and a warning never changes what the simulation does.

Everything else a script can observe from outside the simulation enters as a recorded input:

- `Math.random` is seeded for each runtime from the world's seed, and its state is part of the
  saved runtime state that replay restores.
- `Date` reads one clock value per tick, admitted and recorded with the tick's inputs.
- `@minecraft/server-net` responses arrive as inputs to a later tick, as offloaded work does under
  [ADR 0011](0011-a-world-exchanges-only-plain-data.md).
- Debugger traffic from `/script debugger` is a connection-lane concern. A paused script pauses
  its world's tick, and a replay ignores the debugger.

A replay of a world that runs scripts therefore runs the same scripts and reaches the same digest.

## Considered options

**Wall-clock termination, with each termination recorded as a replay input.** It matches BDS's
setting units exactly. A replay would then terminate at whatever instruction the recording names,
which the engine cannot reach without counting steps anyway. A slow host would also terminate
scripts that a fast host lets finish, so one pack would behave differently on different machines.

**Scripts as a declared source of nondeterminism**, with replay undefined while one is loaded. Bug
reports from scripted servers could not be replayed, and those are the servers this format is for.

## Consequences

- A step is coarse: one step is about 10,000 polls. The constant that sets it is compile-time,
  and a patch can make it smaller if a scenario needs a finer budget.
- A step is not a millisecond. A step-intensive script that BDS allows inside 10,000 ms may stop
  earlier or later on JSP. The ratio is a default an admin can change, and the parity suite
  records where it differs.
- Script performance is measured in steps and host calls, which are the same on every machine, as
  the repository's rules on measuring performance require.
