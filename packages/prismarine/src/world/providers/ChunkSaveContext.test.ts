import { describe, expect, it } from 'vitest';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { Vector3 } from '@jsprismarine/math';

import type { StoreActor } from '../../entity/data/storeActors';
import { stub } from '../../testing/stub.test.helper';
import { createChunkSaveContext } from './ChunkSaveContext';

/** A persistent actor in chunk `chunk`, with this runtime id and saved actor id. */
const actorIn = (chunk: number, runtimeId: bigint, actorId: bigint, type = 'minecraft:cow') => {
    const persistentNbt = new NBTTagCompound('');
    persistentNbt.addValue('UniqueID', new Types.LongVal(actorId));
    return {
        chunk,
        actor: stub<StoreActor>({
            getRuntimeId: () => runtimeId,
            getType: () => type,
            getPosition: () => new Vector3(0, 64, 0),
            shouldPersist: () => true,
            persistentNbt
        })
    };
};

describe('the chunk save context', () => {
    it('lists each chunk in ascending runtime id order, whatever order the world keeps them in', () => {
        const late = actorIn(0, 9n, 1n);
        const early = actorIn(0, 2n, 2n);
        const elsewhere = actorIn(1, 5n, 3n);
        const player = actorIn(0, 1n, 4n, 'minecraft:player');
        const chunkOf = new Map(
            [late, early, elsewhere, player].map(({ actor, chunk }) => [actor.getRuntimeId(), chunk])
        );

        const context = createChunkSaveContext(
            0,
            [late, elsewhere, player, early].map(({ actor }) => actor),
            (actor) => chunkOf.get(actor.getRuntimeId()) ?? -1
        );

        expect(context.entitiesByChunk.get(0)).toEqual([early.actor, late.actor]);
        expect(context.persistentEntitiesByChunk.get(0)).toEqual([early.actor, late.actor]);
        expect(context.entitiesByChunk.get(1)).toEqual([elsewhere.actor]);
        expect(context.actorIdsInWorld).toEqual(new Set([1n, 2n, 3n]));
    });

    it('gives a duplicate actor id to the entity with the lower runtime id', () => {
        const higher = actorIn(0, 7n, 111n);
        const lower = actorIn(1, 3n, 111n);

        const context = createChunkSaveContext(0, [higher.actor, lower.actor], ({ getRuntimeId }) =>
            getRuntimeId() === 7n ? 0 : 1
        );

        expect(context.firstEntityByActorId.get(111n)).toBe(lower.actor);
    });
});
