import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../ServerContent';
import { fixtureContentOptions } from '../testing';
import type { ContentBlock, ContentPosition, ServerWorldAdapter } from './adapter';
import { singleDimension } from './adapter';
import { NotWiredError } from './notWired';
import { unwiredWorld } from './unwired';

/** The block the stub world holds at every position, and the one it reports loaded. */
const LIT_LAMP: ContentBlock = { identifier: 'minecraft:redstone_lamp', states: { lit: true } };

/**
 * A world backed by one block, one entity and a fixed clock.
 *
 * It implements the six required groups and none of the five optional ones,
 * which is the state the following subsystems start from: every projection
 * the core can answer works, and every member that needs a group nobody has
 * supplied throws.
 */
const stubWorld = (): { adapter: ServerWorldAdapter; writes: ContentPosition[]; sounds: string[] } => {
    const writes: ContentPosition[] = [];
    const sounds: string[] = [];

    const adapter: ServerWorldAdapter = {
        level: {
            dimension: 'minecraft:nether',
            minY: 0,
            maxY: 128,
            hasSkyLight: false,
            seaLevel: 32,
            seed: 7n,
            gameTime: () => 1200,
            dayTime: () => 6000,
            difficulty: () => 'hard',
            weather: () => 'rain',
            isRainingAt: () => false,
            spawnPosition: () => ({ x: 0, y: 64, z: 0 })
        },
        blocks: {
            get: () => LIT_LAMP,
            set: (at) => void writes.push(at),
            notifyNeighbors: () => {},
            data: () => ({ analogOutput: 9 }),
            setData: () => {},
            light: () => 11,
            power: () => 4,
            isLoaded: () => true,
            surfaceY: () => 70,
            biome: () => 'minecraft:plains',
            biomeTags: () => ['minecraft:is_overworld']
        },
        entities: {
            at: () => [{ id: 3, identifier: 'minecraft:cow', position: { x: 1, y: 2, z: 3 } }],
            near: () => [],
            players: () => [{ id: 1, identifier: 'minecraft:player', position: { x: 0, y: 64, z: 0 } }],
            spawn: () => 42,
            remove: () => {},
            drop: () => {},
            countOfType: () => 2
        },
        effects: {
            playSound: (_at, sound) => void sounds.push(sound),
            spawnParticle: () => {},
            emitGameEvent: () => {}
        },
        ticks: { schedule: () => {}, isScheduled: () => false, runsThisTick: () => false },
        random: { nextFloat: () => 0.5, nextInt: (bound) => bound - 1 }
    };

    return { adapter, writes, sounds };
};

const contentFor = (adapter: ServerWorldAdapter) =>
    buildServerContent(fixtureContentOptions({ world: singleDimension(adapter) }));

describe('the content world views', () => {
    it('gives the block behaviors a world in the dimension they asked for', () => {
        const { adapter, writes, sounds } = stubWorld();
        const content = contentFor(adapter);
        const actions = content.world.blockWorld.at('minecraft:nether');

        expect(actions.getBlock({ x: 1, y: 2, z: 3 })).toEqual({
            identifier: 'minecraft:redstone_lamp',
            position: { x: 1, y: 2, z: 3 },
            dimension: 'minecraft:nether',
            states: { lit: true }
        });

        actions.setBlock({ x: 4, y: 5, z: 6 }, 'minecraft:stone');
        actions.playSound({ x: 0, y: 0, z: 0 }, 'block.stone.place');

        expect(writes).toEqual([{ x: 4, y: 5, z: 6 }]);
        expect(sounds).toEqual(['block.stone.place']);
        expect(actions.redstonePower({ x: 0, y: 0, z: 0 })).toBe(4);
        expect(actions.entitiesAt({ x: 0, y: 0, z: 0 })).toEqual([
            { id: 3, identifier: 'minecraft:cow', position: { x: 1, y: 2, z: 3 } }
        ]);
    });

    it('answers a block behavior’s property lookup out of the resolved block types', () => {
        const { adapter } = stubWorld();
        const content = contentFor(adapter);
        const actions = content.world.blockWorld.at('minecraft:nether');

        expect(actions.propertiesOf('minecraft:stone').requiresCorrectTool).toBe(true);
        expect(actions.propertiesOf('minecraft:nothing_declared_this').friction).toBeCloseTo(0.6);
    });

    it('answers the light engine out of the flattened block table', () => {
        const { adapter } = stubWorld();
        const content = contentFor(adapter);

        expect(content.world.lightView.hasSkyLight).toBe(false);
        expect(content.world.lightView.maxY).toBe(128);
        expect(content.world.lightView.blockAt(0, 10, 0)).toEqual({ lightEmission: 15, lightDampening: 15 });
    });

    it('renames the engine system’s world onto the same adapter', () => {
        const { adapter } = stubWorld();
        const engine = contentFor(adapter).world.engineWorld;

        expect(engine.getBlock({ x: 0, y: 0, z: 0 })).toEqual({
            name: 'minecraft:redstone_lamp',
            states: { lit: true }
        });
        expect(engine.getDimension()).toBe('nether');
        expect(engine.getDifficulty()).toBe('hard');
        expect(engine.getGameTime()).toBe(1200);
        expect(engine.getBlockEntityData({ x: 0, y: 0, z: 0 })).toEqual({
            analogOutput: 9,
            comparatorOutput: undefined
        });
        expect(engine.randomInt(10)).toBe(9);
    });

    it('answers the spawn queries the core covers', () => {
        const { adapter } = stubWorld();
        const spawn = contentFor(adapter).world.spawnWorld;

        expect(spawn.block({ x: 0, y: 0, z: 0 })).toBe('minecraft:redstone_lamp');
        expect(spawn.light({ x: 0, y: 0, z: 0 })).toBe(11);
        expect(spawn.surfaceY(0, 0)).toBe(70);
        expect(spawn.players()).toEqual([{ position: { x: 0, y: 64, z: 0 } }]);
        expect(spawn.typeCount('minecraft:cow', { x: 0, y: 0, z: 0 }, 32)).toBe(2);
        expect(spawn.age()).toBe(1200);
    });

    it('names the subsystem that owes a group nobody has supplied', () => {
        const { adapter } = stubWorld();
        const world = contentFor(adapter).world;

        expect(() => world.spawnWorld.site('surface', { x: 0, y: 0, z: 0 })).toThrow(NotWiredError);
        expect(() => world.spawnWorld.poolCount('animal')).toThrow(/entities subsystem/);
        expect(() => world.itemActions.environment()).toThrow(/blocks and items subsystem/);
        expect(() => world.brainWorld()).toThrow(/entities subsystem/);
        expect(() => world.featureWorld(0, 0)).toThrow(/world subsystem/);
    });

    it('builds content with no world at all and fails at the first world read', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.blocks.types.size).toBe(2);
        expect(() => content.world.blockWorld.at('minecraft:overworld').getBlock({ x: 0, y: 0, z: 0 })).toThrow(
            NotWiredError
        );
    });

    it('answers the dimension facts it honestly can before a world exists', () => {
        const adapter = unwiredWorld({ dimension: 'minecraft:the_end', seed: 3n });

        expect(adapter.level.dimension).toBe('minecraft:the_end');
        expect(adapter.level.seed).toBe(3n);
        expect(() => adapter.level.gameTime()).toThrow(NotWiredError);
    });
});
