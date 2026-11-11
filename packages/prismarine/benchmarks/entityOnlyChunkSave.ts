/** Measures bytes written by an autosave pass after an entity moves without block edits. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { Types } from '@jsprismarine/nbt';
import type { Logger } from '@jsprismarine/logger';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import type { Config } from '../src/config/Config';
import { EntitySerializer } from '../src/entity/EntitySerializer';
import type Server from '../src/Server';
import { stub } from '../src/testing/stub.test.helper';
import { liveTestEntities } from '../src/testing/entityServer';
import { testLevel } from '../src/testing/level';
import { savedActorNbt } from '../src/testing/savedActor.test.helper';
import { ChunkCompletionQueue } from '../src/world/ChunkCompletionQueue';
import { DimensionTravel } from '../src/world/portal/DimensionTravel';
import { Dimensions } from '../src/world/Dimension';
import type { Generator } from '../src/world/Generator';
import Chunk from '../src/world/chunk/Chunk';
import LevelDB from '../src/world/providers/leveldb/LevelDB';
import type { World } from '../src/world/World';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

const main = async (): Promise<void> => {
    const savePath = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-entity-only-save-'));
    const logger = stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, verbose: () => {} });
    let world: World | undefined;
    const entities = liveTestEntities(() => world);
    // Never activated, so a chunk's lighting completes inline.
    const chunkCompletionQueue = new ChunkCompletionQueue();
    let server: Server;
    server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0, getEntityTrackingInterval: () => 20 }),
        getContent: () => entities.content(),
        getEntityRuntime: (dimension) => entities.entityRuntime(dimension),
        getStorePlayers: () => entities.players,
        getChunkCompletionQueue: () => chunkCompletionQueue,
        getDimensionTravel: () => new DimensionTravel(server)
    });
    const provider = new LevelDB(savePath, server);
    const generator: Generator = {
        generateChunk: async (x, z) => {
            const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
            chunk.fillColumn(0, 0, -64, -49, BlockRuntimeIds.getByName('minecraft:stone'));
            return chunk;
        }
    };
    const level = testLevel({
        name: 'entity-only-save benchmark',
        path: savePath,
        server,
        provider,
        generator,
        spawn: new Vector3(0, -60, 0)
    });

    try {
        await level.enable();
        world = await level.world(OVERWORLD_STEM_ID);
        // No pack declares the cow, so it is an inert store entity: it keeps its saved identifier
        // and its `UniqueID`, runs nothing and is saved with its chunk.
        const live = entities.entityRuntime(world.getDimension().name);
        const saved = savedActorNbt('minecraft:cow', { x: 2, y: 64, z: 2 });
        saved.addValue('UniqueID', new Types.LongVal(2739n));
        const entity = live.restoreInert(EntitySerializer.fromNBT(saved));
        if (entity === undefined) throw new Error('the fixture content has no inert actor type');
        await world.getChunk(0, 0);

        await world.saveChunks();
        const initialBatchBytes = provider.getChunkWriteBatchBytes();
        entity.body.teleportTo({ x: 3, y: 64, z: 2 });
        const chunk = world.getLoadedChunk(0, 0);
        const blockChanges = chunk?.getPersistenceChanges();
        await world.saveChunks();
        const entityOnlyBatchBytes = provider.getChunkWriteBatchBytes() - initialBatchBytes;

        process.stdout.write(
            `${JSON.stringify({
                benchmark: 'entity-only-world-autosave',
                actorMoved: true,
                blockEdits: 0,
                entityOnlyBatchBytes,
                blockSubChunksWritten: blockChanges?.subChunks.length ?? 0,
                data3DWritten: blockChanges?.data3D ?? false,
                blockEntitiesWritten: blockChanges?.blockEntities ?? false
            })}\n`
        );
    } finally {
        await level.disable();
        fs.rmSync(savePath, { recursive: true, force: true });
    }
};

await main();
