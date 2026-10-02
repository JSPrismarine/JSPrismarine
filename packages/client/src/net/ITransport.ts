/** How urgently a payload should leave. Mirrors RakNet's own two levels. */
export enum SendPriority {
    NORMAL,
    IMMEDIATE
}

export interface TransportStats {
    /** Smoothed round trip in milliseconds, or null before the first measurement. */
    readonly rtt: number | null;
    readonly bytesSent: number;
    readonly bytesReceived: number;
    readonly packetsSent: number;
    readonly packetsReceived: number;
}

export interface TransportEvents {
    /** One complete Minecraft batch, still framed - id, prefix and all. */
    batch: (payload: Buffer) => void;
    close: (reason: string) => void;
}

/**
 * What the client needs from whatever carries its bytes.
 *
 * The seam that lets single player be the same client as multiplayer: over a network this
 * is RakNet over UDP, and in the same process it is a loopback pair, and nothing above here
 * can tell which. It deliberately sits *below* batching - a transport moves opaque payloads
 * and knows nothing about compression, encryption or packet ids, all of which belong to the
 * session on top of it.
 */
export interface ITransport {
    connect(): Promise<void>;

    /** Sends one framed batch. */
    send(payload: Buffer, priority?: SendPriority): void;

    on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): void;
    off<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): void;

    close(reason?: string): void;

    /** Counters the bot harness reports on; cheap enough to read every tick. */
    getStats(): TransportStats;
}
