import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty, LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import type { ContentPosition } from '../content/world/adapter';
import { definitionsOf } from '../content/ContentOptions';
import { fixtureContentOptions } from '../content/testing';
import { unwiredWorld } from '../content/world/unwired';
import { Dimensions } from '../world/Dimension';
import { GameRules } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { DamageCause } from './DamageCause';
import type { Entity } from './Entity';
import { explode } from './Explosion';
import { Attribute, AttributeIds } from './Attribute';
import { GenericEntity } from './GenericEntity';

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
    const nearby: Entity[] = [];
    const effects: LevelEvent[] = [];
    const cleared: string[] = [];
    const dropped: Array<{ at: ContentPosition; names: string[] }> = [];

    const world: any = {
        getName: () => 'test',
        getTicks: () => 0,
        getDimension: () => Dimensions.Overworld,
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getRandom: () => () => 0.5,
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL }),
            getLogger: () => ({ error: () => {}, debug: () => {} }),
            // No pack stack by default, so there are no loot tables and nothing drops.
            getContent: () => content
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        sendWorldEvent: async (_at: unknown, event: LevelEvent) => void effects.push(event),
        broadcastMove: async () => {},
        playNamedSound: () => {},
        getGameRuleManager: () => ({
            getGameRule: (name: string) => [name === GameRules.MobGriefing ? griefing : true, true]
        }),
        getEntityGrid: () => ({ near: () => nearby }),
        loadedBlockAt: () => ({ name: blockName, states: {} }),
        setLoadedBlockState: (x: number, y: number, z: number) => {
            cleared.push(`${x},${y},${z}`);
            return true;
        },
        dropFromBlock: async (at: ContentPosition, contents: Array<{ getName(): string }>) =>
            void dropped.push({ at, names: contents.map((item) => item.getName()) }),
        getLoadedChunk: () => null
    };

    /**
     * A body in the blast, with the health the caller wants to watch come off it.
     *
     * `GenericEntity` is what the data-driven runtime gives every mob, so it is what a blast
     * actually catches. The shove is recorded rather than applied: the base entity has no
     * velocity to spend, and what this scene checks is that the blast asked for one.
     */
    const spawn = (identifier: string, x = 0, z = 0, health = 10): Shoved => {
        const entity = new Shoved({ identifier, position: new Position(x, 64, z, world) });
        entity.attributes.setAttribute(new Attribute({ name: AttributeIds.Health, min: 0, max: health, def: health }));
        nearby.push(entity);
        return entity;
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
        world: {
            at: () => {
                const base = unwiredWorld();
                return { ...base, blocks: { ...base.blocks, data: () => undefined, setData: () => {} } };
            }
        }
    });

/** A body that remembers the shove it was given instead of spending it. */
class Shoved extends GenericEntity {
    public shove: { x: number; z: number; strength: number } | undefined;

    public override applyKnockback(directionX: number, directionZ: number, strength: number): void {
        this.shove = { x: directionX, z: directionZ, strength };
    }
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

    return 100 - golem.getHealth();
};

describe('explosions', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    it('kills anything standing on top of it', async () => {
        const cow = stage.spawn('minecraft:cow', 0, 0);
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(cow.isAlive()).toBe(false);
    });

    it('falls away steeply with distance', async () => {
        const close = await blastAt(1);
        const middling = await blastAt(3);
        const far = await blastAt(5);

        expect(close).toBeGreaterThan(middling);
        expect(middling).toBeGreaterThan(far);
        expect(far).toBeGreaterThan(0);
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

        expect(100 - golem.getHealth()).toBe(1);
    });

    it('reports itself as an explosion, and names who set it off', async () => {
        const creeper = stage.spawn('minecraft:creeper', 0, 0);
        const cow = stage.spawn('minecraft:cow', 4, 0);

        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, source: creeper, breaksBlocks: false });

        expect(cow.getLastDamageSource()?.cause).toBe(DamageCause.Explosion);
        expect(cow.getLastDamageSource()?.attacker).toBe(creeper);
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

            expect(cow.getHealth()).toBeLessThan(10);
        });

        it('drops nothing for a block the pack stack has no loot table for', async () => {
            const bare = scene({ solid: true });
            await explode(bare.world, new Vector3(0, 64, 0), { power: 3 });

            expect(bare.dropped).toEqual([]);
        });

        it("yields what the block's Java loot table says, not the block", async () => {
            // The fixture's `minecraft:blocks/stone` drops cobblestone, which is the point:
            // an explosion rolls the same table a pickaxe does rather than a path of its own.
            const quarry = scene({ solid: true, content: buildServerContent(blastContentOptions()) });

            await explode(quarry.world, new Vector3(0, 64, 0), { power: 3 });

            expect(quarry.dropped.length).toBeGreaterThan(0);
            expect(new Set(quarry.dropped.flatMap((drop) => drop.names))).toEqual(new Set(['minecraft:cobblestone']));
        });
    });
});
