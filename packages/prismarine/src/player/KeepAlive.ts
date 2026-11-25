/**
 * The pings that check a client of either edition is still there. Each edition sends its own ping,
 * Java's `Clientbound Keep Alive` and Bedrock's `NetworkStackLatency`, and hears its own answer;
 * the timing and the verdict are the same for both. A client that leaves a ping unanswered until
 * the next one is due is disconnected, as vanilla Java disconnects it.
 */

/**
 * Runs `run` every `ms` milliseconds until the returned function is called; the real timer unless
 * a test gives its own.
 */
export type KeepAliveTimer = (run: () => void, ms: number) => () => void;

const realTimer: KeepAliveTimer = (run, ms) => {
    const timer = setInterval(run, ms);
    // A ping alone never holds the process open.
    timer.unref();
    return () => clearInterval(timer);
};

/** What a keep-alive does for one connection. */
export interface KeepAliveOptions {
    /** The time between pings, in milliseconds. */
    readonly intervalMs: number;
    /** Sends the edition's ping, which carries `id`. */
    ping(id: bigint): void;
    /** Disconnects the client, which left a ping unanswered for a whole interval. */
    timedOut(): void;
    /** The id each ping carries; the time it is sent, in milliseconds, unless a test gives another. */
    readonly idOf?: () => bigint;
    readonly timer?: KeepAliveTimer;
}

/** One connection's pings. */
export class KeepAlive {
    private cancel: (() => void) | undefined;
    private awaiting: bigint | undefined;

    public constructor(private readonly options: KeepAliveOptions) {}

    /** Starts pinging, one interval from now. Does nothing for an interval of 0, or once started. */
    public start(): void {
        if (this.options.intervalMs <= 0 || this.cancel !== undefined) return;
        const idOf = this.options.idOf ?? (() => BigInt(Date.now()));
        this.cancel = (this.options.timer ?? realTimer)(() => {
            if (this.awaiting !== undefined) {
                this.stop();
                this.options.timedOut();
                return;
            }
            this.awaiting = idOf();
            this.options.ping(this.awaiting);
        }, this.options.intervalMs);
    }

    /**
     * Takes the client's answer.
     * @param id - The id the answer carries, which must be the one the ping carried; undefined for
     *   an edition whose answer is not reliably the id sent, as Bedrock's is not, where any answer
     *   counts.
     */
    public answered(id?: bigint): void {
        if (id === undefined || id === this.awaiting) this.awaiting = undefined;
    }

    /** Stops pinging, as the connection closes. */
    public stop(): void {
        this.cancel?.();
        this.cancel = undefined;
    }
}
