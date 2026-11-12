/** Measures chunk save work across chunk and actor counts. Run with `pnpm run bench:world-save`. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { Logger } from '@jsprismarine/logger';
import type { StoreActor } from '../src/entity/data/storeActors';
import { stub } from '../src/testing/stub.test.helper';
import type Server from '../src/Server';
import type { World } from '../src/world/World';
import { Dimensions } from '../src/world/DimensionType';
import Chunk from '../src/world/chunk/Chunk';
import { createChunkSaveContext } from '../src/world/providers/ChunkSaveContext';
import LevelDB from '../src/world/providers/leveldb/LevelDB';
import type { Position } from '../src/world/Position';

const makeEntities = (count: number, chunkWidth: number): StoreActor[] => {
    const world = stub<World>({ getDimension: () => Dimensions.Overworld });

    return Array.from({ length: count }, (_unused, index) => {
        const chunkX = index % chunkWidth;
        const chunkZ = Math.floor(index / chunkWidth) % chunkWidth;
        const position = stub<Position>({
            getX: () => chunkX * 16 + 1,
            getY: () => 64,
            getZ: () => chunkZ * 16 + 1
        });
        const persistentNbt = new NBTTagCompound('');
        persistentNbt.addValue('UniqueID', new Types.LongVal(BigInt(index + 1)));

        return stub<StoreActor>({
            getRuntimeId: () => BigInt(index + 1),
            getType: () => 'minecraft:cow',
            getPosition: () => position,
            getTags: () => [],
            getStatusEffects: () => [],
            getPortalCooldown: () => 0,
            getWorld: () => world,
            shouldPersist: () => true,
            persistentNbt,
            yaw: 0,
            pitch: 0
        });
    });
};

const run = async (chunkCount: number, entityCount: number): Promise<void> => {
    const chunkWidth = Math.ceil(Math.sqrt(chunkCount));
    const chunks = Array.from(
        { length: chunkCount },
        (_unused, index) =>
            new Chunk(index % chunkWidth, Math.floor(index / chunkWidth), new Map(), Dimensions.Overworld)
    );
    const entities = makeEntities(entityCount, chunkWidth);
    const world = stub<World>({
        getName: () => 'world-save benchmark',
        getSeed: () => 1234n,
        getDimension: () => Dimensions.Overworld,
        getActors: () => entities
    });
    const logger = stub<Logger>({ warn: () => undefined });
    const server = stub<Server>({ getLogger: () => logger });
    const savePath = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-save-bench-'));
    const provider = new LevelDB(savePath, server);
    provider.setWorld(world);
    await provider.enable();

    let entityVisits = 0;
    const started = performance.now();
    const saveContext = createChunkSaveContext(Dimensions.Overworld.bedrockId, entities, (entity) => {
        entityVisits++;
        const position = entity.getPosition();
        return Chunk.packXZ(Math.floor(position.getX() / 16), Math.floor(position.getZ() / 16));
    });
    for (const chunk of chunks) await provider.writeChunk(chunk, saveContext);
    const saveMs = performance.now() - started;
    await provider.disable();
    fs.rmSync(savePath, { recursive: true, force: true });

    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'world-save',
            chunks: chunkCount,
            entities: entityCount,
            saveMs: Number(saveMs.toFixed(2)),
            entityListTraversals: 1,
            entityVisits,
            formerPerChunkEntityVisits: chunkCount * entityCount
        })}\n`
    );
};

for (const chunks of [100, 441]) {
    for (const entities of [0, 200, 2000]) await run(chunks, entities);
}
