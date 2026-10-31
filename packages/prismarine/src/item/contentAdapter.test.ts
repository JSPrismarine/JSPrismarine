import { describe, expect, it } from 'vitest';

import type { ItemWorldAction, SourceState } from '@jsprismarine/item-behaviors';

import { createContentBlockGroup } from '../block/contentAdapter';
import type { BlockEntityStore, BlockStorageAccess } from '../block/contentAdapter';
import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions } from '../content/testing';
import { singleDimension } from '../content/world/adapter';
import type {
    ContentBlock,
    ContentEffectSink,
    ContentEntityAccess,
    ContentPosition,
    ServerWorldAdapter
} from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import { unwiredWorld } from '../content/world/unwired';
import { createContentItemGroup } from './contentAdapter';
import type { ActorItemAction, ItemActorPort } from './contentAdapter';

const key = (at: ContentPosition) => `${at.x},${at.y},${at.z}`;

const stone: ContentBlock = { identifier: 'minecraft:stone', states: {} };
const air: ContentBlock = { identifier: 'minecraft:air', states: {} };

const blockEntityStore = (): BlockEntityStore => ({ at: () => undefined, put: () => undefined });

/** The source every action in these tests comes from. */
const steve = { identifier: 'minecraft:player', runtimeId: 1 } as const;

/** A player standing still in survival, which is what the two queries answer with here. */
const idle: SourceState = {
    position: { x: 0, y: 0, z: 0 },
    creative: false,
    onGround: true,
    eyeInWater: false,
    gliding: false,
    inWaterOrRain: false,
    fallDistance: 0,
    effects: [],
    cooldownGroups: [],
    foodLevel: 20
};

/**
 * The whole group over a real content build, with every neighboring group
 * recorded rather than stubbed out, so an assertion names the call the
 * adapter actually made.
 */
const harness = (initial: Record<string, ContentBlock> = {}, placeEndCrystal?: (base: ContentPosition) => boolean) => {
    const stored = new Map(Object.entries(initial));
    const storage: BlockStorageAccess = {
        at: (position) => stored.get(key(position)),
        write: (position, block) => void stored.set(key(position), block)
    };

    const sounds: string[] = [];
    const spawned: string[] = [];
    const delegated: ActorItemAction[] = [];

    let content: ServerContent | undefined;
    const blocks = createContentBlockGroup({ storage, blockEntities: blockEntityStore(), content: () => content! });

    const unwired = unwiredWorld();
    const effects: ContentEffectSink = {
        ...unwired.effects,
        playSound: (at, sound) => void sounds.push(`${key(at)} ${sound}`)
    };
    const entities: ContentEntityAccess = {
        ...unwired.entities,
        spawn: (identifier, at) => {
            spawned.push(`${identifier} ${key(at)}`);
            return spawned.length;
        }
    };
    const actors: ItemActorPort = {
        stateOf: () => idle,
        targetOf: () => undefined,
        perform: (action) => void delegated.push(action)
    };

    const items = createContentItemGroup({
        blocks,
        entities,
        effects,
        level: unwired.level,
        actors,
        content: () => content!,
        ...(placeEndCrystal === undefined ? {} : { placeEndCrystal })
    });

    const adapter: ServerWorldAdapter = {
        ...unwired,
        blocks: { ...unwired.blocks, ...blocks },
        entities,
        effects,
        items
    };
    content = buildServerContent(fixtureContentOptions({ world: singleDimension(adapter) }));

    return { items, blockAt: (at: ContentPosition) => stored.get(key(at)), sounds, spawned, delegated };
};

describe('item', () => {
    describe('content item group', () => {
        it('puts a block down where a placement says', () => {
            const { items, blockAt } = harness();

            items.perform({
                kind: 'place-block',
                position: { x: 1, y: 2, z: 3 },
                placement: { identifier: 'minecraft:stone', states: {} }
            });

            expect(blockAt({ x: 1, y: 2, z: 3 })).toEqual(stone);
        });

        it('leaves air behind when a bucket takes a block out', () => {
            const { items, blockAt } = harness({ '0,0,0': stone });

            items.perform({ kind: 'break-block', position: { x: 0, y: 0, z: 0 } });

            expect(blockAt({ x: 0, y: 0, z: 0 })).toEqual(air);
        });

        it('lights a fire on the face that was clicked, and only into air', () => {
            const { items, blockAt } = harness({ '0,0,0': stone, '0,1,0': air, '1,0,0': stone });

            items.perform({ kind: 'ignite', position: { x: 0, y: 0, z: 0 }, face: 'up' });
            expect(blockAt({ x: 0, y: 1, z: 0 })?.identifier).toBe('minecraft:fire');

            items.perform({ kind: 'ignite', position: { x: 0, y: 0, z: 0 }, face: 'east' });
            expect(blockAt({ x: 1, y: 0, z: 0 })).toEqual(stone);
        });

        it('plays a sound and spawns an entity through the groups that own them', () => {
            const { items, sounds, spawned } = harness();

            items.perform({ kind: 'play-sound', sound: 'random.fizz', position: { x: 1, y: 1, z: 1 } });
            items.perform({ kind: 'spawn-entity', identifier: 'minecraft:cow', position: { x: 2, y: 2, z: 2 } });

            expect(sounds).toEqual(['1,1,1 random.fizz']);
            expect(spawned).toEqual(['minecraft:cow 2,2,2']);
        });

        it('hands every entity-facing variant to the actor port untouched', () => {
            const { items, delegated } = harness();
            const actions: readonly ItemWorldAction[] = [
                { kind: 'feed', target: steve, nutrition: 4, saturation: 2.4 },
                { kind: 'grant-experience', target: steve, amount: 7 },
                { kind: 'start-cooldown', source: steve, group: 'minecraft:ender_pearl', ticks: 20 }
            ];

            for (const action of actions) items.perform(action);

            expect(delegated).toEqual(actions);
        });

        it('reads the world around the source off the level facts', () => {
            const content = buildServerContent(fixtureContentOptions());
            const unwired = unwiredWorld();
            const items = createContentItemGroup({
                blocks: createContentBlockGroup({
                    storage: { at: () => undefined, write: () => undefined },
                    blockEntities: blockEntityStore(),
                    content: () => content
                }),
                entities: unwired.entities,
                effects: unwired.effects,
                level: { ...unwired.level, dayTime: () => 6000, spawnPosition: () => ({ x: 8, y: 64, z: 8 }) },
                actors: { stateOf: () => idle, targetOf: () => undefined, perform: () => undefined },
                content: () => content
            });

            expect(items.environment()).toEqual({
                dimension: 'minecraft:overworld',
                timeOfDay: 6000,
                spawnPosition: { x: 8, y: 64, z: 8 }
            });
        });

        it('resolves a holder set tag through the merged tags, and a list without them', () => {
            const { items } = harness();

            expect(items.includes({ kind: 'entries', entries: ['minecraft:stone'] }, 'minecraft:stone')).toBe(true);
            expect(items.includes({ kind: 'entries', entries: ['minecraft:stone'] }, 'minecraft:dirt')).toBe(false);
            expect(items.includes({ kind: 'tag', tag: 'minecraft:mineable/pickaxe' }, 'minecraft:stone')).toBe(true);
            expect(items.includes({ kind: 'tag', tag: 'minecraft:mineable/pickaxe' }, 'minecraft:dirt')).toBe(false);
        });

        it('declines a block transformer and a potion the server was given no table for', () => {
            const { items } = harness();

            expect(items.transform('minecraft:axe', { identifier: 'minecraft:oak_log', states: {} })).toBeUndefined();
            expect(items.effectsOf('minecraft:swiftness')).toEqual([]);
        });

        it('forwards end crystal placement to the host and returns its decision', () => {
            const bases: ContentPosition[] = [];
            const { items } = harness({}, (base) => {
                bases.push(base);
                return true;
            });
            const base = { x: 2, y: 64, z: -3 };

            expect(items.placeEndCrystal?.(base)).toBe(true);
            expect(bases).toEqual([base]);
            expect(harness().items.placeEndCrystal?.(base)).toBe(false);
        });

        it('answers a transformer and a potion out of the tables it is given', () => {
            const content = buildServerContent(fixtureContentOptions());
            const stripped = { identifier: 'minecraft:stripped_oak_log', states: {} };
            const items = createContentItemGroup({
                blocks: createContentBlockGroup({
                    storage: { at: () => undefined, write: () => undefined },
                    blockEntities: blockEntityStore(),
                    content: () => content
                }),
                entities: unwiredWorld().entities,
                effects: unwiredWorld().effects,
                level: unwiredWorld().level,
                actors: { stateOf: () => idle, targetOf: () => undefined, perform: () => undefined },
                content: () => content,
                transformers: (transformer) => (transformer === 'minecraft:axe' ? stripped : undefined),
                potions: () => [{ id: 'minecraft:speed', durationTicks: 3600, amplifier: 0, showIcon: true }]
            });

            expect(items.transform('minecraft:axe', { identifier: 'minecraft:oak_log', states: {} })).toEqual(stripped);
            expect(items.transform('minecraft:hoe', { identifier: 'minecraft:oak_log', states: {} })).toBeUndefined();
            expect(items.effectsOf('minecraft:swiftness')).toHaveLength(1);
        });
    });
});
