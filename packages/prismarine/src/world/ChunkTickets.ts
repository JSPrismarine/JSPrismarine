/**
 * Chunk tickets: how a system inside a tick asks for chunks it does not have without waiting.
 *
 * A system that needs chunks takes a ticket on them. The ticket starts a load for each one that
 * is missing and returns at once, and the system goes into a waiting state. Each load completes
 * as an input, admitted at a later tick's input step
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)), and the system
 * asks again on its next tick and continues once every chunk is in. A ticketed chunk does not
 * unload until its ticket is released.
 */
import Chunk from './chunk/Chunk';

/** A chunk, by its chunk coordinates. */
export interface ChunkCoordinate {
    readonly x: number;
    readonly z: number;
}

/** What the tickets read from and start in their world. */
export interface ChunkTicketHost {
    /** Whether the chunk is in the world. */
    isLoaded(x: number, z: number): boolean;
    /**
     * Starts loading a chunk whose completion an input step admits, and returns without waiting
     * for it.
     *
     * @returns Whether a load started; false for a chunk already loading.
     */
    load(x: number, z: number): boolean;
}

/** The chunks within a block box, inclusive, as chunk coordinates. */
export const chunksOfBlockBox = (minX: number, minZ: number, maxX: number, maxZ: number): ChunkCoordinate[] => {
    const chunks: ChunkCoordinate[] = [];
    for (let x = minX >> 4; x <= maxX >> 4; x += 1)
        for (let z = minZ >> 4; z <= maxZ >> 4; z += 1) chunks.push({ x, z });
    return chunks;
};

/** The tickets one world holds, keyed by their owner. */
export class ChunkTickets {
    private readonly tickets = new Map<string, readonly number[]>();
    private readonly held = new Map<number, number>();
    private started = 0;

    public constructor(private readonly host: ChunkTicketHost) {}

    /** How many loads the tickets have started, for a test that counts them. */
    public get loadsStarted(): number {
        return this.started;
    }

    /**
     * Takes or renews a ticket on a set of chunks, starting a load for each one that is missing.
     * A second request from the same owner replaces its ticket.
     *
     * @param owner - Who holds the ticket, such as `dragon-fight:arena`.
     * @param chunks - The chunks the owner needs.
     * @returns Whether every chunk is loaded now, so the owner can do its work this tick.
     */
    public request(owner: string, chunks: Iterable<ChunkCoordinate>): boolean {
        const indices: number[] = [];
        let ready = true;
        for (const { x, z } of chunks) {
            indices.push(Chunk.packXZ(x, z));
            if (this.host.isLoaded(x, z)) continue;

            ready = false;
            if (this.host.load(x, z)) this.started += 1;
        }

        this.release(owner);
        this.tickets.set(owner, indices);
        for (const index of indices) this.held.set(index, (this.held.get(index) ?? 0) + 1);
        return ready;
    }

    /** Gives up an owner's ticket, so its chunks may unload again. Releasing none does nothing. */
    public release(owner: string): void {
        const indices = this.tickets.get(owner);
        if (indices === undefined) return;

        this.tickets.delete(owner);
        for (const index of indices) {
            const count = (this.held.get(index) ?? 0) - 1;
            if (count > 0) this.held.set(index, count);
            else this.held.delete(index);
        }
    }

    /** Whether a ticket holds the chunk, which keeps it from unloading. */
    public holds(x: number, z: number): boolean {
        return this.held.has(Chunk.packXZ(x, z));
    }

    /** Whether the owner holds a ticket. */
    public has(owner: string): boolean {
        return this.tickets.has(owner);
    }
}
