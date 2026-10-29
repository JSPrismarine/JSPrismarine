/**
 * The shutdown and interrupt machinery `Server.shutdown` runs on: the stopping
 * flag, the interrupt holds given back when a shutdown begins, and the force
 * exit a second request means. Extracted verbatim from `Server`; the ordering
 * of the teardown itself — console, ticker, player kicks, managers, listener —
 * stays in `Server.shutdown`, which owns those collaborators.
 */
export class ShutdownLifecycle {
    /** If the server is stopping. */
    private stopping = false;

    /**
     * What this process has to give back once a shutdown has begun, so that the next
     * interrupt can reach the kernel.
     *
     * Two things in a running server take Ctrl+C away from the kernel, and both earn their
     * keep right up until a shutdown starts. A terminal in raw mode turns the keypress into
     * stdin byte 3 and raises no signal at all, which Node's tty documentation says of
     * `setRawMode` outright. A `process.on('SIGINT')` listener replaces Node's default
     * disposition with a callback. Each of them needs the event loop to turn before anything
     * happens, and a shutdown slow enough to be interrupted twice is usually one where the
     * loop is busy generating terrain. Measured against a loop blocked for five seconds:
     * Node's default killed the process 10 ms after the signal, and a listener ran 3.3
     * seconds after it, once the block had ended anyway.
     *
     * So the first interrupt gives both of them up and the second is a kernel kill again.
     */
    private readonly interruptHolds = new Set<() => void>();

    /** Whether a shutdown has begun. */
    public isStopping(): boolean {
        return this.stopping;
    }

    /**
     * Registers something to undo the moment a shutdown begins.
     *
     * For what the callers give up and why, see {@link ShutdownLifecycle.interruptHolds}. A
     * release runs once, synchronously, before the shutdown awaits anything - which is the
     * whole point, as the teardown may not get another turn of the event loop for seconds.
     * @param release - Gives up whatever is keeping the kernel from killing this process.
     */
    public releaseOnShutdown(release: () => void): void {
        this.interruptHolds.add(release);
    }

    /**
     * Marks the shutdown begun.
     * @returns False when one had already begun, which is the force-exit case.
     */
    public beginShutdown(): boolean {
        if (this.stopping) return false;
        this.stopping = true;
        return true;
    }

    /**
     * Runs every registered release, once. Called before the shutdown awaits anything, so
     * the escape is armed even if everything after has to wait for a busy event loop.
     */
    public releaseHolds(): void {
        for (const release of this.interruptHolds) release();
        this.interruptHolds.clear();
    }

    /**
     * What a second request to stop means: stop now, wherever the first one got to.
     *
     * Waiting for the graceful shutdown instead is not an escape worth offering. The unit it
     * is in the middle of is a chunk, a chunk is hundreds of milliseconds of uninterruptible
     * generation, and the start region asks for them thirty-two at a time - so a force that
     * waits for the current unit can take twenty seconds, which is the freeze the operator
     * pressed Ctrl+C about.
     *
     * The cost is bounded. The provider is LevelDB, which journals every write, so a process
     * that dies mid-write loses the writes that had not reached the journal and reopens
     * through its own recovery. That is the same contract as `kill -9`, which the operator
     * has anyway. Durability is what the *first* interrupt buys, by running the whole ordered
     * teardown; this is the way out of it, not a replacement for it.
     *
     * `stayAlive` callers are the exception. `/stop` tears the server down and keeps the
     * process, so a second `/stop` has no process to force out of anything.
     * @param {object} [options] - The options the repeat request carried.
     * @param {boolean} [options.stayAlive] - If the process should outlive the shutdown.
     */
    public forceExit(options?: { stayAlive?: boolean }): void {
        if (options?.stayAlive) return;

        // Not through the logger: the shutdown that is already running disables it on its way
        // out, and this line has to print whether or not it got that far.
        process.stderr.write('\nForcing exit. Anything the shutdown had not written yet is lost.\n');
        process.exit(1);
    }
}
