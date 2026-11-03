import type SharedByteRing from './SharedByteRing';

interface PendingEvent {
    readonly parts: readonly Buffer[];
    readonly byteLength: number;
}

/** Preserves worker event order while the shared ring is under backpressure. */
export default class WorkerEventQueue {
    private readonly pending: PendingEvent[] = [];
    private pendingBytes = 0;

    /** Creates an ordered staging queue for one worker-to-main shared ring. */
    public constructor(
        private readonly ring: SharedByteRing,
        private readonly maxPendingBytes: number
    ) {}

    /** Writes immediately only when no older event is waiting; otherwise stages this event. */
    public write(parts: readonly Buffer[]): boolean {
        if (this.pending.length === 0 && this.ring.tryWriteParts(parts)) return true;

        const ownedParts = parts.map((part) => Buffer.from(part));
        const byteLength = ownedParts.reduce((total, part) => total + part.byteLength, 0);
        if (this.pendingBytes + byteLength > this.maxPendingBytes) return false;
        this.pending.push({ parts: ownedParts, byteLength });
        this.pendingBytes += byteLength;
        return true;
    }

    /** Copies staged events into the ring in arrival order until it fills. */
    public drain(): void {
        while (this.pending.length > 0) {
            const event = this.pending[0]!;
            if (!this.ring.tryWriteParts(event.parts)) return;
            this.pending.shift();
            this.pendingBytes -= event.byteLength;
        }
    }
}
