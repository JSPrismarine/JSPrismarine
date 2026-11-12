import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty, LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import type { Logger } from '@jsprismarine/logger';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import type { ContentPosition } from '../content/world/adapter';
import { definitionsOf } from '../content/ContentOptions';
import { fixtureContentOptions, fixtureItemDefinitions } from '../content/testing';
import { unwiredWorld } from '../content/world/unwired';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Block } from '../block/Block';
import type { Item } from '../item/Item';
import { Dimensions } from '../world/Dimension';
import { GameRules } from '../world/GameRuleManager';
import type { World } from '../world/World';
import { DamageCause } from './DamageCause';
import type { DamageSource } from './DamageSource';
import { DEFAULT_BOX } from './data/facts';
import type { LiveEntityRuntime } from './data/live';
import type { StoreActor, StoreActors } from './data/storeActors';
import { entityFixture } from './data/testing';
import { explode } from './Explosion';

/** @see {@link emptyContent} */
let bareBuild: ServerContent | undefined;

/**
 * A build that declares nothing: no block type, no loot table, no entity.
 *
 * Every scene needs one, because an entity reads its hitbox off the content, and most of the
 * tests below want a server whose pack stack has nothing to say about the block that broke.
 * Built once and shared; nothing mutates a resolved `ServerContent`.
 */
const emptyContent = (): ServerContent =>
    (bareBuild ??= buildServerContent(
        fixtureContentOptions({ load: () => ({ definitions: definitionsOf({}), diagnostics: [] }) })
    ));

/**
 * Blasts, over a world of one block repeated.
 *
 * The ray cast itself is `@jsprismarine/engine-systems`' and is proved there against Java's own
 * numbers. What is checked here is the translation: that the blast reads this server's chunks,
 * writes through them, hurts the entities in the grid, and rolls each broken block's loot table.
 */
const scene = ({ griefing = true, solid = false, block = '', content = emptyContent() } = {}) => {
    const blockName = block !== '' ? block : solid ? 'minecraft:stone' : 'minecraft:air';
    // A real store, so a blast finds what it catches through the index the way a live world's
    // does. Its actors are doubles that keep the blows they took, which is what is checked here;
    // `live.test.ts` runs a blast through the store's damage pipeline.
    const store = entityFixture().runtime;
    const caught = new Map<number, Caught>();
    const live = stub<LiveEntityRuntime>({
        runtime: store,
        actors: stub<StoreActors>({ actorOf: (id: number) => caught.get(id)?.actor }),
        damageEntity: (actor: StoreActor, amount: number, source: DamageSource) => {
            const hit = caught.get(actor.entity.id);
            if (hit === undefined) return undefined;
            hit.health = Math.max(0, hit.health - amount);
            hit.lastSource = source;
            return amount > 0;
        }
    });
    const effects: LevelEvent[] = [];
    const cleared: string[] = [];
    const dropped: Array<{ at: ContentPosition; names: string[] }> = [];

    const runtimeId = BlockRuntimeIds.tryGetByState(blockName, {});
    if (runtimeId === null) throw new Error(`no block state registered for ${blockName}`);

    const server = stub<Server>({
        post: () => 0,
        getTick: () => 0,
        getRandom: () => () => 0.5,
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL }),
        getLogger: () => stub<Logger>({ error: () => {}, debug: () => {} }),
        // Most scenes have no pack stack, so there are no loot tables and nothing drops.
        getContent: () => content
    });

    const world = stub<World>({
        getName: () => 'test',
        getTicks: () => 0,
        getDimension: () => Dimensions.Overworld,
        getServer: () => server,
        sendActorEvent: () => {},
        sendActorSound: () => {},
        sendWorldEvent: (_at: unknown, event: LevelEvent) => void effects.push(event),
        broadcastMove: async () => {},
        playNamedSound: () => {},
        getGameRuleManager: () =>
            stub<ReturnType<World['getGameRuleManager']>>({
                getGameRule: (name: string) => [name === GameRules.MobGriefing ? griefing : true, true]
            }),
        getEntityIndex: () => store.index,
        loadedBlockAt: () => ({ name: blockName, states: {} }),
        loadedBlockRuntimeIdAt: () => runtimeId,
        setLoadedBlockState: (x: number, y: number, z: number) => {
            cleared.push(`${x},${y},${z}`);
            return true;
        },
        dropFromBlock: async (at: ContentPosition, contents: Array<Block | Item | null>) =>
            void dropped.push({ at, names: contents.flatMap((item) => (item === null ? [] : [item.getName()])) }),
        getLoadedChunk: () => null,
        dataEntities: () => live
    });

    /**
     * A store entity in the blast, with the health the caller wants to watch come off it.
     *
     * Filed in the store's index as a cow, whatever the type it reports, because the index is all
     * a blast reads of the store. The shove is recorded rather than applied, because what this
     * scene checks is that the blast asked for one.
     */
    const spawn = (identifier: string, x = 0, z = 0, health = 10): Caught => {
        const entity = store.spawn('minecraft:cow', { x, y: 64, z });
        if (entity === undefined) throw new Error('the fixture declares no cow');
        const hit: Caught = {
            health,
            lastSource: undefined,
            shove: undefined,
            actor: stub<StoreActor>({
                entity,
                getRuntimeId: () => BigInt(entity.id),
                getType: () => identifier,
                getPosition: () => new Vector3(entity.position.x, entity.position.y, entity.position.z),
                getFeetY: () => entity.position.y,
                getBox: () => DEFAULT_BOX,
                isAlive: () => hit.health > 0,
                applyKnockback: (x: number, z: number, strength: number) => {
                    hit.shove = { x, z, strength };
                }
            }),
            moveTo: (toX, toZ) => {
                entity.position = { x: toX, y: 64, z: toZ };
            }
        };
        caught.set(entity.id, hit);
        return hit;
    };

    return { world, spawn, effects, cleared, dropped };
};

/**
 * The fixture content, with the two world members a break reads wired up.
 *
 * A blast now takes a block out through the content hooks, which read the block entity at
 * the position before the family gets `onBreak`. The unwired adapter throws on that read,
 * which a break treats as the content declining and falls back from, so a fixture that
 * leaves it unwired rolls no table at all. Nothing stands at the position in this scene, so
 * the honest answer is that there is no block entity.
 */
const blastContentOptions = () =>
    fixtureContentOptions({
        itemDefinitions: [
            ...fixtureItemDefinitions(),
            ...vanillaItemDefinitions().filter(({ identifier }) => identifier === 'minecraft:cobblestone')
        ],
        world: {
            at: () => {
                const base = unwiredWorld();
                return {
                    ...base,
                    blocks: { ...base.blocks, data: () => undefined, setData: () => {} },
                    entities: { ...base.entities, drop: () => {} }
                };
            }
        }
    });

/** A store entity a scene put in the blast's way, and what the blast did to it. */
interface Caught {
    readonly actor: StoreActor;
    health: number;
    lastSource: DamageSource | undefined;
    /** The shove it was given, kept instead of spent. */
    shove: { x: number; z: number; strength: number } | undefined;
    /** Moves it in the store, which refiles it in the index. */
    moveTo(x: number, z: number): void;
}

/**
 * How much health something this far from a power-3 blast loses.
 *
 * A hundred health rather than a cow's ten, because a power-3 blast is lethal to ten out to
 * three blocks. Every reading inside that range would come back as "all of it" and the curve
 * would be invisible.
 */
const blastAt = async (distance: number): Promise<number> => {
    const stage = scene();
    const golem = stage.spawn('minecraft:iron_golem', distance, 0, 100);

    await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

    return 100 - golem.health;
};

describe('explosions', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    it('kills anything standing on top of it', async () => {
        const cow = stage.spawn('minecraft:cow', 0, 0);
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(cow.health).toBe(0);
    });

    it('falls away steeply with distance', async () => {
        const close = await blastAt(1);
        const middling = await blastAt(3);
        const far = await blastAt(5);

        expect(close).toBeGreaterThan(middling);
        expect(middling).toBeGreaterThan(far);
        expect(far).toBeGreaterThan(0);
    });

    it('catches an entity where it moved to earlier in the tick', async () => {
        const moved = stage.spawn('minecraft:cow', 40, 0);
        const stayed = stage.spawn('minecraft:cow', 40, 2);
        moved.moveTo(0, 0);

        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(moved.health).toBe(0);
        expect(stayed.health).toBe(10);
    });

    it('does nothing at all past twice its power', async () => {
        expect(await blastAt(7)).toBe(0);
    });

    it('still costs half a heart to something in range with no line of sight', async () => {
        // A solid world, so every exposure ray is stopped and the seen fraction is zero. Java
        // adds a flat one at the end of the curve all the same.
        const walled = scene({ solid: true, griefing: false });
        const golem = walled.spawn('minecraft:iron_golem', 4, 0, 100);

        await explode(walled.world, new Vector3(0, 64, 0), { power: 3 });

        expect(100 - golem.health).toBe(1);
    });

    it('reports itself as an explosion, and names who set it off', async () => {
        const creeper = stage.spawn('minecraft:creeper', 0, 0);
        const cow = stage.spawn('minecraft:cow', 4, 0);

        await explode(stage.world, new Vector3(0, 64, 0), {
            power: 3,
            source: creeper.actor,
            breaksBlocks: false
        });

        expect(cow.lastSource?.cause).toBe(DamageCause.Explosion);
        expect(cow.lastSource?.attacker).toBe(creeper.actor);
    });

    it('throws what it hurts away from the center', async () => {
        const cow = stage.spawn('minecraft:cow', 3, 0);
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(cow.shove?.x).toBeGreaterThan(0);
        expect(cow.shove?.strength).toBeGreaterThan(0);
    });

    it('throws up particles', async () => {
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(stage.effects).toContain(LevelEvent.PARTICLES_EXPLOSION);
    });

    describe('what it does to the world', () => {
        it('takes blocks out', async () => {
            const digging = scene({ solid: true });
            await explode(digging.world, new Vector3(0, 64, 0), { power: 3 });

            expect(digging.cleared.length).toBeGreaterThan(0);
        });

        // Blast resistance comes from the Java-sourced property table, keyed by block state
        // name. A ray loses `(resistance + 0.3) * 0.3` to every block it crosses, so what gives
        // way is whatever a ray of `power * (0.7 to 1.3)` can still spend itself through.
        it.each([
            ['minecraft:dirt', 0.5],
            ['minecraft:stone', 6],
            ['minecraft:oak_planks', 3]
        ])('breaks the soft: %s resists only %d', async (block) => {
            const digging = scene({ block });
            await explode(digging.world, new Vector3(0, 64, 0), { power: 4 });

            expect(digging.cleared.length).toBeGreaterThan(0);
        });

        it.each([
            ['minecraft:obsidian', 1200],
            ['minecraft:bedrock', 3600000],
            ['minecraft:ender_chest', 600],
            ['minecraft:anvil', 1200],
            ['minecraft:water', 100],
            ['minecraft:flowing_lava', 100]
        ])('cannot shift the hard: %s resists %d', async (block) => {
            const bouncing = scene({ block });
            await explode(bouncing.world, new Vector3(0, 64, 0), { power: 4 });

            expect(bouncing.cleared).toEqual([]);
        });

        it('treats a block outside the table as unresisting, as the old name set did', async () => {
            const chemistry = scene({ block: 'minecraft:element_1' });
            await explode(chemistry.world, new Vector3(0, 64, 0), { power: 4 });

            expect(chemistry.cleared.length).toBeGreaterThan(0);
        });

        it('leaves the world alone when mobGriefing is off', async () => {
            const polite = scene({ solid: true, griefing: false });
            await explode(polite.world, new Vector3(0, 64, 0), { power: 3 });

            expect(polite.cleared).toEqual([]);
        });

        it('still hurts things with mobGriefing off', async () => {
            const polite = scene({ solid: true, griefing: false });
            const cow = polite.spawn('minecraft:cow', 1, 0);

            await explode(polite.world, new Vector3(0, 64, 0), { power: 3 });

            expect(cow.health).toBeLessThan(10);
        });

        it('drops nothing for a block the pack stack has no loot table for', async () => {
            const bare = scene({ solid: true });
            await explode(bare.world, new Vector3(0, 64, 0), { power: 3 });

            expect(bare.dropped).toEqual([]);
        });

        it("yields what the block's Java loot table says, not the block", async () => {
            // The fixture's `minecraft:blocks/stone` drops cobblestone, which is the point:
            // an explosion rolls the same table a pickaxe does rather than a path of its own.
            const content = buildServerContent(blastContentOptions());
            expect(content.items.types.has('minecraft:cobblestone')).toBe(true);
            const quarry = scene({ solid: true, content });

            await explode(quarry.world, new Vector3(0, 64, 0), { power: 3 });

            expect(quarry.dropped.length).toBeGreaterThan(0);
            expect(new Set(quarry.dropped.flatMap((drop) => drop.names))).toEqual(new Set(['minecraft:cobblestone']));
        });
    });
});
