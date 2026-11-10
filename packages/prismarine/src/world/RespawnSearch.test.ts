import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Block } from '../block/Block';
import { BlockState } from '../block/state/BlockState';
import { EYE_HEIGHT } from '../entity/Human';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from './DimensionType';
import type { DimensionType } from './DimensionType';
import { RespawnSearch } from './RespawnSearch';
import type { RespawnRequest } from './RespawnSearch';
import type { World } from './World';

/** A world of air with the named blocks placed, keyed by `x,y,z`. */
const worldOf = (dimension: DimensionType, blocks: Record<string, string> = {}, spawn = new Vector3(0, 64, 0)) => {
    const nameAt = (x: number, y: number, z: number): string => blocks[`${x},${y},${z}`] ?? 'minecraft:air';
    return stub<World>({
        getDimension: () => dimension,
        getSpawnPosition: async () => spawn,
        getBlockState: async (x, y, z) => new BlockState(nameAt(x, y, z)),
        getBlock: async (x, y, z) => stub<Block>({ isSolid: () => nameAt(x, y, z) !== 'minecraft:air' })
    });
};

/** A search over an Overworld and a Nether, which records each world it is asked to build. */
const searchOver = ({ overworld = worldOf(Dimensions.Overworld), nether = worldOf(Dimensions.Nether) } = {}) => {
    const built: string[] = [];
    const worlds = new Map([
        [Dimensions.Overworld.id, overworld],
        [Dimensions.Nether.id, nether]
    ]);
    const search = new RespawnSearch({
        hasStem: (stemId) => worlds.has(stemId),
        world: async (stemId) => {
            built.push(stemId);
            const world = worlds.get(stemId);
            if (world === undefined) throw new Error(`no ${stemId}`);
            return world;
        },
        worldSpawn: () => overworld
    });
    return { search, built };
};

const request = (spawnPoint?: RespawnRequest['spawnPoint']): RespawnRequest => ({
    player: 'Steve',
    spawnPoint,
    body: { width: 0.6, height: 1.8, eyeHeight: EYE_HEIGHT }
});

describe('RespawnSearch', () => {
    it('answers the world spawn for a player with no point of their own', async () => {
        const { search, built } = searchOver();

        const answer = await search.find(request());

        expect(answer).toEqual({
            player: 'Steve',
            spawn: 'world',
            dimension: Dimensions.Overworld.id,
            announced: { x: 0.5, y: 64 + EYE_HEIGHT, z: 0.5 },
            block: { x: 0, y: 64, z: 0 },
            eyes: { x: 0, y: 64 + EYE_HEIGHT, z: 0 },
            spawnPointLost: false
        });
        expect(built).toEqual([]);
    });

    it('raises the world spawn out of the blocks the body overlaps', async () => {
        const overworld = worldOf(Dimensions.Overworld, { '0,64,0': 'minecraft:stone', '-1,65,0': 'minecraft:stone' });
        const { search } = searchOver({ overworld });

        const answer = await search.find(request());

        expect(answer.block).toEqual({ x: 0, y: 66, z: 0 });
    });

    it('stands the player beside a bed in another dimension of the level', async () => {
        const nether = worldOf(Dimensions.Nether, { '10,40,10': 'minecraft:red_bed' });
        const { search, built } = searchOver({ nether });

        const answer = await search.find(request({ x: 10, y: 40, z: 10, dimension: 'minecraft:nether' }));

        expect(answer).toMatchObject({
            spawn: 'own',
            dimension: Dimensions.Nether.id,
            block: { x: 10, y: 40, z: 11 },
            spawnPointLost: false
        });
        expect(built).toEqual([Dimensions.Nether.id]);
    });

    it('uses a point `/spawnpoint` set whatever stands there', async () => {
        const overworld = worldOf(Dimensions.Overworld, { '5,70,5': 'minecraft:stone' });
        const { search } = searchOver({ overworld });

        const answer = await search.find(
            request({ x: 5, y: 70, z: 5, dimension: Dimensions.Overworld.id, forced: true })
        );

        expect(answer).toMatchObject({ spawn: 'own', block: { x: 5, y: 70, z: 5 } });
    });

    it('reports a bed that is gone as lost and answers the world spawn', async () => {
        const { search } = searchOver();
        const spawnPoint = { x: 10, y: 64, z: 10, dimension: Dimensions.Overworld.id };
        const asked = request(spawnPoint);

        const answer = await search.find(asked);

        expect(answer).toMatchObject({ spawn: 'world', block: { x: 0, y: 64, z: 0 }, spawnPointLost: true });
        // The search writes nothing: the player clears its own point once it has the answer.
        expect(asked.spawnPoint).toBe(spawnPoint);
    });

    it('builds no world for a point in a dimension the level has no stem for', async () => {
        const { search, built } = searchOver();

        const answer = await search.find(request({ x: 0, y: 64, z: 0, dimension: 'custom:nowhere' }));

        expect(answer).toMatchObject({ spawn: 'world', spawnPointLost: true });
        expect(built).toEqual([]);
    });

    it('asks and answers in plain data, which a structured clone keeps whole', async () => {
        const nether = worldOf(Dimensions.Nether, { '10,40,10': 'minecraft:red_bed' });
        const { search } = searchOver({ nether });
        const asked = request({ x: 10, y: 40, z: 10, dimension: Dimensions.Nether.id });

        const answer = await search.find(structuredClone(asked));

        expect(structuredClone(answer)).toEqual(answer);
        expect(await search.find(asked)).toEqual(answer);
    });
});
