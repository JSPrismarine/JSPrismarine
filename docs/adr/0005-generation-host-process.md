# Run chunk generation in a host process, and keep the in-process pool as the fallback

Status: accepted. Supersedes the rejection of "a separate generation process over a socket" in
[ADR 0002](0002-chunk-generation-architecture.md).

Generation workers are threads of the server process. Node cannot give one thread a lower
priority: `os.setPriority` calls `setpriority(PRIO_PROCESS, pid)` on Unix and `SetPriorityClass`
on Windows, both per process, and a worker that calls it lowers the whole server (measured on
macOS; see [the research note](../research/worldgen-pool-and-pipeline-architecture.md)). Threads
also share the server's heap, so generation garbage can pause the tick. We run the generation pool
inside a child process, set that process's priority from the server, and talk to it over an IPC
channel. When no child can be started, the same pool runs in the server process as before.

The measurements that motivate it are in
[worldgen-decoupling-baseline.md](../research/worldgen-decoupling-baseline.md), and the work is
sliced in [worldgen-decoupling.md](../plans/worldgen-decoupling.md).

## Why ADR 0002's reasoning no longer applies

ADR 0002 rejected a separate process because it "loses both transferable `ArrayBuffer` and the
shared registry bundle", and priced the bundle at 75 ms for eight workers against 540 ms reading
from disk. That assumed the process boundary sits between the server and every worker. Here the
boundary sits between the server and one host, and the host runs its own workers:

- The registry bundle and climate tables are `SharedArrayBuffer`s shared between the host's
  workers, so the 75 ms figure is paid once per host process, not once per worker. The host
  receives the bundle's bytes over the channel once at startup and shares them from there.
- Transferable buffers are not lost between workers and the host. Between the host and the server
  a result is copied, because a buffer cannot be transferred across processes.

## What we build

**One transport interface.** `GenerationTransport` is the surface `GenerationPool` and
`ShardedGenerationPool` already have: run a task in a priority band, cancel waiting tasks, promote
them, read counters and stats, destroy. `GenerationPool` implements it in process, and
`HostedGenerationPool` implements it over a child process. A caller holds the interface.

**The host.** `generationHost` is a module run by `child_process.fork` with advanced serialization.
It builds a `GenerationPool` from the options it is sent, runs tasks, and posts each result back.
The server sets the child's priority with `os.setPriority(child.pid, PRIORITY_LOW)`.

**Predicates stay on the server.** `cancel` and `promote` take a function, and a function cannot
cross the channel. The server keeps every outstanding task, applies the predicate to its own
records, and sends the host the ids to cancel or move.

**Restart and retry.** If the host exits while tasks are outstanding, the server starts a new one
and sends the outstanding tasks again. A task is a pure function of the seed, the position, the
pack data and the status's inputs (ADR 0002, guarantee 1), so a retry returns the same bytes. A
host that dies repeatedly stops being restarted and the transport falls back to the in-process
pool.

**Selection.** `createGenerationTransport` starts a host when the caller allows it and the process
can fork the generation entry, and otherwise builds the in-process pool and says why.

## What it costs

- A result is copied through the channel and deserialized on the server's event loop. The cost per
  hop is measured in the slice 2 report. Until slice 1 makes results small wire-ready payloads, the
  hop carries a full region.
- A second process holds its own copy of per-process state: one registry bundle, one set of climate
  tables, its own V8 heap. Memory use rises by about one process's worth of that state.
- Process lifecycle: startup handshake, restart, and a second Ctrl+C reaching the child. The child
  exits when its channel closes, so a server that dies does not leave one behind.
- Priority is a hint. It is strong on Linux, weaker on macOS and different on Windows, and it does
  nothing about a container's CPU quota, which is slice 3's problem.
- A Bun-compiled executable starts the host by running itself again with `--role generation-host`;
  its entry hands that role to `generationHost` before anything else loads. A Node single
  executable cannot yet start the host, because `singleExecutableWorker.ts` handles workers and not
  a forked role, so it keeps the in-process pool.

## What stays the same

Generated output. Every status body runs the same code in a worker, and which process hosted the
worker cannot show in the result. The digests ADR 0002 specifies are checked across both
transports.

## Alternatives not taken

**A socket instead of an IPC channel.** It would let the host run on another machine, which is the
later remote tier. The transport interface is the seam for that, and nothing here needs it yet.

**Lowering priority per worker thread.** Not portable. Only Linux's thread-level nice does it, and
Node gives a worker no thread id to name.
