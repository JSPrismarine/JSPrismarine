import type { Entity } from '../../entity/Entity';

/** Entity and actor indexes shared by every chunk write in one save or unload pass. */
export interface ChunkSaveContext {
    /** Bedrock dimension id these entities belong to. */
    readonly dimensionId: number;
    /** Non-player entities in each chunk, in the world's entity iteration order. */
    readonly entitiesByChunk: ReadonlyMap<number, readonly Entity[]>;
    /** Persistent non-player entities in each chunk, in the world's entity iteration order. */
    readonly persistentEntitiesByChunk: ReadonlyMap<number, readonly Entity[]>;
    /** Persistent actor ids in the dimension; providers add ids allocated during this pass. */
    readonly actorIdsInWorld: Set<bigint>;
    /** The first persistent entity encountered for each existing actor id. */
    readonly firstEntityByActorId: ReadonlyMap<bigint, Entity>;
}

/** Builds the indexes a provider needs without revisiting the world's entity list per chunk. */
export const createChunkSaveContext = (
    dimensionId: number,
    entities: Iterable<Entity>,
    chunkIndexOf: (entity: Entity) => number
): ChunkSaveContext => {
    const entitiesByChunk = new Map<number, Entity[]>();
    const persistentEntitiesByChunk = new Map<number, Entity[]>();
    const actorIdsInWorld = new Set<bigint>();
    const firstEntityByActorId = new Map<bigint, Entity>();

    for (const entity of entities) {
        if (entity.getType() === 'minecraft:player') continue;

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
        if (!firstEntityByActorId.has(actorId)) firstEntityByActorId.set(actorId, entity);
    }

    return { dimensionId, entitiesByChunk, persistentEntitiesByChunk, actorIdsInWorld, firstEntityByActorId };
};
