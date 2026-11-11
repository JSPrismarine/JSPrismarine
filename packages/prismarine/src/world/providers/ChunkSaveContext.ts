import type { StoreActor } from '../../entity/data/storeActors';
import { byRuntimeId } from '../runtimeIdOrder';
import { PLAYER_IDENTIFIER } from '../../entity/playerOverlay';

/** Entity and actor indexes shared by every chunk write in one save or unload pass. */
export interface ChunkSaveContext {
    /** Bedrock dimension id these entities belong to. */
    readonly dimensionId: number;
    /** Non-player entities in each chunk, in ascending runtime id order. */
    readonly entitiesByChunk: ReadonlyMap<number, readonly StoreActor[]>;
    /** Persistent non-player entities in each chunk, in ascending runtime id order. */
    readonly persistentEntitiesByChunk: ReadonlyMap<number, readonly StoreActor[]>;
    /** Persistent actor ids in the dimension; providers add ids allocated during this pass. */
    readonly actorIdsInWorld: Set<bigint>;
    /** The persistent entity with the lowest runtime id for each existing actor id. */
    readonly firstEntityByActorId: ReadonlyMap<bigint, StoreActor>;
}

/**
 * Builds the indexes a provider needs without revisiting the world's entity list per chunk.
 *
 * The entities may come in any order. What the indexes hold is put in ascending runtime id order,
 * so a chunk saves its entities in the same order whatever order the world keeps them in.
 */
export const createChunkSaveContext = (
    dimensionId: number,
    entities: Iterable<StoreActor>,
    chunkIndexOf: (entity: StoreActor) => number
): ChunkSaveContext => {
    const entitiesByChunk = new Map<number, StoreActor[]>();
    const persistentEntitiesByChunk = new Map<number, StoreActor[]>();
    const actorIdsInWorld = new Set<bigint>();
    const firstEntityByActorId = new Map<bigint, StoreActor>();

    for (const entity of entities) {
        if (entity.getType() === PLAYER_IDENTIFIER) continue;

        const chunkIndex = chunkIndexOf(entity);
        let entitiesInChunk = entitiesByChunk.get(chunkIndex);
        if (entitiesInChunk === undefined) {
            entitiesInChunk = [];
            entitiesByChunk.set(chunkIndex, entitiesInChunk);
        }
        entitiesInChunk.push(entity);

        if (!entity.shouldPersist()) continue;

        let persistentEntitiesInChunk = persistentEntitiesByChunk.get(chunkIndex);
        if (persistentEntitiesInChunk === undefined) {
            persistentEntitiesInChunk = [];
            persistentEntitiesByChunk.set(chunkIndex, persistentEntitiesInChunk);
        }
        persistentEntitiesInChunk.push(entity);

        const persistentNbt = entity.persistentNbt;
        if (!persistentNbt?.has('UniqueID')) continue;

        const actorId = persistentNbt.getLong('UniqueID', 0n);
        actorIdsInWorld.add(actorId);
        const first = firstEntityByActorId.get(actorId);
        if (first === undefined || entity.getRuntimeId() < first.getRuntimeId())
            firstEntityByActorId.set(actorId, entity);
    }

    for (const listed of entitiesByChunk.values()) listed.sort(byRuntimeId);
    for (const listed of persistentEntitiesByChunk.values()) listed.sort(byRuntimeId);

    return { dimensionId, entitiesByChunk, persistentEntitiesByChunk, actorIdsInWorld, firstEntityByActorId };
};
