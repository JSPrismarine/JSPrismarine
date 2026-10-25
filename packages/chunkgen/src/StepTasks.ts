import type { ChunkStatus } from './ChunkStatus';
import type { ChunkStep } from './ChunkStep';
import type { ProtoChunk } from './ProtoChunk';
import type { StagedChunk } from './StagedChunk';

/**
 * Reads a neighbor's chunk, having already been told the read is inside the step's window.
 *
 * The scheduler supplies this over its holder map. It raises `ChunkNotReadyError` when the chunk
 * has not reached the status, which means a layer ran before the layer below it finished.
 */
export type NeighborReader<TChunk extends StagedChunk = ProtoChunk> = (
    chunkX: number,
    chunkZ: number,
    status: ChunkStatus
) => TChunk;

/**
 * What one status body is handed: its own chunk, and the neighbors its step declared.
 *
 * This is Java's `WorldGenRegion`, narrowed to the part that makes the output reproducible. Every
 * neighbor read goes through {@link StepRegion.neighbor}, which checks the offset and the status
 * against the step table and throws rather than returning a chunk at the wrong status. An input
 * the step did not declare is therefore a crash on the first chunk instead of a block that differs
 * on the thousandth.
 */
export class StepRegion<TChunk extends StagedChunk = ProtoChunk> {
    /**
     * @param step - The rung being climbed, which carries the read window and the write radius.
     * @param center - The chunk the body is advancing, at the status below.
     * @param read - Fetches a neighbor, called only after the window check has passed.
     */
    public constructor(
        public readonly step: ChunkStep,
        public readonly center: TChunk,
        private readonly read: NeighborReader<TChunk>
    ) {}

    /** Chunk x coordinate of the chunk being advanced. */
    public get chunkX(): number {
        return this.center.chunkX;
    }

    /** Chunk z coordinate of the chunk being advanced. */
    public get chunkZ(): number {
        return this.center.chunkZ;
    }

    /**
     * A neighbor at a chunk offset, at or above the status the body needs.
     *
     * @param dx - Chunk offset on x from the chunk being advanced.
     * @param dz - Chunk offset on z from the chunk being advanced.
     * @param status - The status the body needs that neighbor to have reached.
     * @throws ChunkReadOutOfWindowError when the step did not declare that status at that distance.
     */
    public neighbor(dx: number, dz: number, status: ChunkStatus): TChunk {
        this.step.requireReadable(dx, dz, status);
        if (dx === 0 && dz === 0) return this.center;
        return this.read(this.chunkX + dx, this.chunkZ + dz, status);
    }

    /** Whether this step may write blocks into the chunk at that offset. */
    public canWriteBlocksAt(dx: number, dz: number): boolean {
        return this.step.canWriteBlocksAt(dx, dz);
    }
}

/**
 * One status's body: a pure function of the seed, the chunk position and the frozen outputs below.
 *
 * It returns the chunk at the new status. Returning the chunk it was handed is the ordinary case;
 * a body that ran in a worker returns one adopted from the payload that came back, which is why
 * the return value is used rather than ignored. The holder records the new status, so a body
 * should not call `advanceTo` itself.
 */
export type StepTask<TChunk extends StagedChunk = ProtoChunk> = (
    region: StepRegion<TChunk>
) => TChunk | Promise<TChunk>;

/**
 * The bodies, by status. This is the seam the server's generation code plugs into.
 *
 * A status with no entry passes its chunk through unchanged, which is what `initialize_light`,
 * `light` and `spawn` do today and what every status above `terrain` does until slice 7. A
 * pass-through still climbs the rung, so the accumulated radii and the retention stay Java's.
 */
export type StepTasks<TChunk extends StagedChunk = ProtoChunk> = Partial<
    Readonly<Record<ChunkStatus, StepTask<TChunk>>>
>;
