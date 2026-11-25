/**
 * Which chunks one client has, and which it still has to be sent, whatever edition it speaks.
 *
 * A session asks for the chunks around its player as the player moves, the server's scheduler
 * takes them off {@link ChunkView.sender} nearest first, and the session's edition sends them: a
 * Bedrock client in batches behind a publisher update, a Java one in chunk batches behind its
 * center chunk. What the client then holds is recorded here, the same for both, so a chunk is
 * neither sent twice nor left out.
 */
import type { ChunkViewArea } from '../world/ChunkViewArea';
import { chunkViewArea, offsetsIn } from '../world/ChunkViewArea';
import Chunk from '../world/chunk/Chunk';
import ChunkSender from './ChunkSender';
import type PlayerSession from './PlayerSession';

/**
 * How an edition that sends its chunks its own way sends them. The session decides which chunks
 * and when, through its {@link ChunkView} and the server's scheduler, and settles what the client
 * kept; the wire only writes them. Bedrock's go out in the session's own batches and need none.
 */
export interface ChunkWire {
    /** Centers the client's view on a chunk, which the client keeps the chunks around. */
    center(x: number, z: number): Promise<void>;
    /** Sends chunks of the world the session's player is in, as one batch. */
    send(chunks: readonly Chunk[], session: PlayerSession): Promise<void>;
}

/**
 * How many failed batches a chunk is queued again after, before the view waits for the player's
 * view to change.
 *
 * A batch fails as a whole, so a chunk that can never be sent takes the chunks queued beside it
 * down too, and retrying without a limit would fail and log once per scheduler pass for as long
 * as the player stands there.
 */
export const CHUNK_SEND_RETRIES = 3;

/** A chunk column's coordinates. */
interface ChunkCoord {
    readonly x: number;
    readonly z: number;
}

/** The chunk a client's view is centered on and the area around it that the client keeps. */
export interface CenteredView {
    readonly x: number;
    readonly z: number;
    readonly area: ChunkViewArea;
}

/** Whether a chunk is inside a view; none, before the first, holds nothing. */
export const insideView = (view: CenteredView | null, x: number, z: number): boolean =>
    view !== null && view.area.contains(x - view.x, z - view.z);

/** One client's chunks. */
export class ChunkView {
    /** What the client still has to receive, nearest first. Drained by the server's scheduler. */
    public readonly sender = new ChunkSender();
    private readonly loaded = new Map<number, ChunkCoord>();
    private readonly loading = new Map<number, ChunkCoord>();
    /** Failed batches by chunk hash since the chunk last reached the client: see {@link CHUNK_SEND_RETRIES}. */
    private readonly failedSends = new Map<number, number>();
    private currentEpoch = 0;

    /**
     * Bumped by {@link ChunkView.clear}. A send compares the value it started with against this
     * once it completes, so a batch that was on the wire while the player changed world does not
     * record the old world's coordinates as loaded in the new.
     */
    public get epoch(): number {
        return this.currentEpoch;
    }

    /** Whether the client holds a chunk. */
    public holds(x: number, z: number): boolean {
        return this.loaded.has(Chunk.packXZ(x, z));
    }

    /** Whether any chunk is queued or on its way, which the spawn and a respawn's answer wait for. */
    public isLoading(): boolean {
        return this.loading.size > 0;
    }

    /** Queues the chunks around a position, nearest first, that the client neither holds nor waits for. */
    public queue(centerX: number, centerZ: number, coordinates: Iterable<readonly [number, number]>): void {
        this.sender.setCenter(centerX, centerZ);
        for (const [x, z] of coordinates) {
            const hash = Chunk.packXZ(x, z);
            if (this.loaded.has(hash) || this.loading.has(hash)) continue;
            this.enqueue(x, z);
        }
    }

    /**
     * Brings the view around a player: queues every chunk of the area the client neither holds nor
     * waits for, or all of them again when `forceResend`, and forgets those outside it.
     *
     * The client drops a chunk once it leaves the area, so the view forgets it then too. A chunk
     * still counted as held after the client dropped it is never sent again when the player comes
     * back: a hole in the world for as long as they stay in view of it.
     * @param centerX - The player's chunk.
     * @param centerZ - The player's chunk.
     * @param viewDistance - The radius, in chunks.
     * @param forceResend - Whether every chunk of the area is sent again.
     * @returns Whether a chunk the client held was forgotten.
     */
    public need(centerX: number, centerZ: number, viewDistance: number, forceResend = false): boolean {
        this.sender.setCenter(centerX, centerZ);

        // One area decides both what is sent and what is forgotten below. See ChunkViewArea
        // for why the two must not be tested separately.
        const area = chunkViewArea(viewDistance);
        for (const [dx, dz] of offsetsIn(area)) {
            const x = centerX + dx;
            const z = centerZ + dz;
            const hash = Chunk.packXZ(x, z);

            if (forceResend) {
                this.loaded.delete(hash);
                if (!this.loading.has(hash)) this.enqueue(x, z);
            } else if (!this.loaded.has(hash) && !this.loading.has(hash)) {
                this.enqueue(x, z);
            }
        }

        let unloaded = false;
        const outOfView = (x: number, z: number): boolean => !area.contains(x - centerX, z - centerZ);

        for (const [hash, { x, z }] of this.loaded) {
            if (outOfView(x, z)) {
                unloaded = true;
                this.loaded.delete(hash);
            }
        }

        for (const [hash, { x, z }] of this.loading) {
            if (outOfView(x, z)) {
                this.loading.delete(hash);
                this.failedSends.delete(hash);

                // And out of the queue too, not only out of the bookkeeping.
                //
                // These two have to be forgotten together: dropping the hash alone left the
                // coordinate in the sender, so the scheduler went on to generate and send a
                // region the player had already walked out of - paid for at the expense of
                // the chunks in front of them. Worse, `loading` no longer knew about it, so
                // walking back in queued it a second time, and a player pacing about could grow
                // the queue without bound.
                this.sender.forget(x, z);
            }
        }
        return unloaded;
    }

    /** Records a queued coordinate once; the sender owns the only nearest-first ordering pass. */
    public enqueue(x: number, z: number): void {
        this.loading.set(Chunk.packXZ(x, z), { x, z });
        this.sender.enqueue(x, z);
    }

    /**
     * Lets go of a chunk the scheduler took off the queue and could not produce, unless a failed
     * send queued it again, which keeps it loading so the view can still forget the retry when the
     * player walks away. Left loading, `need` would never ask for it again: a permanent hole.
     */
    public produceFailed(x: number, z: number): void {
        if (!this.sender.has(x, z)) this.loading.delete(Chunk.packXZ(x, z));
    }

    /**
     * Records a chunk whose send completed.
     *
     * Loaded only when the client kept it. A chunk the client dropped is forgotten instead, so the
     * next `need` that covers it asks again, and queued again at once when it is still in view:
     * a `need` that ran while it was on its way skipped it as loading, so a player who came back
     * to it and stopped would never ask again.
     * @param kept - Whether the client kept it.
     * @param inView - Whether a chunk is inside the area around the player now.
     */
    public settle(x: number, z: number, kept: boolean, inView: (x: number, z: number) => boolean): void {
        const hash = Chunk.packXZ(x, z);
        if (kept) {
            this.loaded.set(hash, { x, z });
            this.loading.delete(hash);
            this.failedSends.delete(hash);
        } else if (!this.sender.has(x, z)) {
            this.loading.delete(hash);
            if (inView(x, z)) this.enqueue(x, z);
        }
    }

    /**
     * Queues again a chunk whose batch failed before its send completed.
     *
     * Forgetting it alone waits for the next `need`, which runs only when the player crosses into
     * another chunk, so a player standing still kept the hole, and one arriving in another
     * dimension sat on the loading screen until its timeout.
     * @param inView - Whether a chunk is inside the area around the player now.
     */
    public retry(x: number, z: number, inView: (x: number, z: number) => boolean): void {
        const hash = Chunk.packXZ(x, z);
        if (this.sender.has(x, z)) return;
        this.loading.delete(hash);
        if (!inView(x, z)) return;
        const failures = (this.failedSends.get(hash) ?? 0) + 1;
        // Out of retries, it waits for a view change, which starts it a fresh count.
        if (failures > CHUNK_SEND_RETRIES) {
            this.failedSends.delete(hash);
            return;
        }
        this.failedSends.set(hash, failures);
        this.enqueue(x, z);
    }

    /**
     * Forgets every chunk, held or on its way, and everything still queued, as a change of world
     * does: they belong to the world being left.
     */
    public clear(): void {
        this.currentEpoch += 1;
        this.loaded.clear();
        this.loading.clear();
        this.failedSends.clear();
        this.sender.clear();
    }
}
