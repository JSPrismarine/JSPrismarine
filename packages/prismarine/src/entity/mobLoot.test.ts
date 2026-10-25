import { load as loadPacks } from '@jsprismarine/packs';
import type { Definitions } from '@jsprismarine/packs';
import type {
    DamageSource as PredicateDamageSource,
    EntityView,
    ItemStack as PredicateItemStack
} from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { buildServerContent } from '../content/ServerContent';
import type { ContentItemDrop } from '../content/world/adapter';
import { resolvePackStack } from '../content/packStack';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import { DamageCause } from './DamageCause';
import type { LootEntity } from './mobLoot';
import { lootDamageSource, mobLootTableOf, rollMobDrops } from './mobLoot';

/**
 * Mob drops are the most visible thing a server can get wrong, so the
 * figures below are Java Edition's own, written out from the 26.3 tables
 * rather than read back out of the table the code reads. A change that makes
 * a zombie drop three rotten flesh fails here even though both halves of the
 * server would agree with each other.
 */

const ORIGIN = { x: 0, y: 64, z: 0 } as const;

/** What every mob on this server reports about itself; see `Mob.lootState`. */
const ALIVE_AND_GROWN = { flags: { is_on_fire: false, is_baby: false } } as const;

/** Builds one content over the fixture stack with the given loot tables, tags and recipes in it. */
const contentWith = (
    tables: Readonly<Record<string, unknown>>,
    tags: Readonly<Record<string, unknown>> = {},
    recipes: Readonly<Record<string, unknown>> = {}
): ServerContent =>
    buildServerContent(
        fixtureContentOptions({
            seed: 1234n,
            load: () => ({
                definitions: {
                    ...fixtureDefinitions(),
                    lootTablesJava: new Map(
                        Object.entries(tables).map(([id, json]) => [id, definitionOf('lootTablesJava', id, json)])
                    ),
                    recipesJava: new Map([
                        ...fixtureDefinitions().recipesJava,
                        ...Object.entries(recipes).map(
                            ([id, json]) => [id, definitionOf('recipesJava', id, json)] as const
                        )
                    ]),
                    tags: new Map([
                        ...fixtureDefinitions().tags,
                        ...Object.entries(tags).map(([id, json]) => [id, definitionOf('tags', id, json)] as const)
                    ])
                },
                diagnostics: []
            })
        })
    );

/** A player, with whatever is in its main hand. */
const player = (mainhand?: PredicateItemStack): EntityView => ({
    type: 'minecraft:player',
    position: ORIGIN,
    equipment: mainhand ? { mainhand } : {}
});

/** A sword a kill is credited to, enchanted or not. */
const sword = (looting = 0): PredicateItemStack => ({
    id: 'minecraft:diamond_sword',
    count: 1,
    components:
        looting > 0
            ? new Map<string, unknown>([['minecraft:enchantments', { levels: { 'minecraft:looting': looting } }]])
            : new Map<string, unknown>()
});

/** A player swinging that sword, as the damage-source predicates read it. */
const killedByPlayer = (looting = 0): PredicateDamageSource => {
    const killer = player(sword(looting));
    return {
        type: 'minecraft:player_attack',
        tags: ['minecraft:is_player_attack'],
        sourceEntity: killer,
        directEntity: killer
    };
};

/** Something standing at the origin, which is all a damage source reads off one. */
const standing = (type: string): LootEntity => ({
    getType: () => type,
    getPosition: () => ({ getX: () => ORIGIN.x, getY: () => ORIGIN.y, getZ: () => ORIGIN.z })
});

/** Rolls one mob's table repeatedly, so a range shows itself rather than one draw from it. */
const rollsOf = (
    content: ServerContent,
    identifier: string,
    times: number,
    context: Parameters<typeof rollMobDrops>[2] = {}
): readonly (readonly ContentItemDrop[])[] =>
    Array.from({ length: times }, () =>
        rollMobDrops(content, identifier, { position: ORIGIN, self: ALIVE_AND_GROWN, ...context })
    );

/** Each roll's total of one item, zero included, which is what a `0..2` range has to show. */
const totalsOf = (rolls: readonly (readonly ContentItemDrop[])[], identifier: string): readonly number[] =>
    rolls.map((drops) =>
        drops.filter((drop) => drop.identifier === identifier).reduce((sum, drop) => sum + drop.count, 0)
    );

/** The low and high of a spread, which is the form a Java count range states. */
const spread = (totals: readonly number[]) => ({ min: Math.min(...totals), max: Math.max(...totals) });

/** One pool of one certain item, which is the smallest table that drops anything. */
const drops = (item: string, condition?: unknown) => ({
    type: 'minecraft:entity',
    pools: [{ rolls: 1, condition, entries: [{ type: 'minecraft:item', name: item }] }]
});

/**
 * One fixture content for the whole plumbing suite: a creeper that drops,
 * a skeleton only a player's kill drops, a zombified piglin under the name
 * Java gives it, a sheep sub-table with no sheep above it, and no wolf.
 */
let plumbing: ServerContent | undefined;
const fixture = (): ServerContent => {
    plumbing ??= contentWith(
        {
            'minecraft:entities/creeper': drops('minecraft:gunpowder'),
            'minecraft:entities/skeleton': drops('minecraft:bone', { type: 'minecraft:killed_by_player' }),
            'minecraft:entities/zombified_piglin': { type: 'minecraft:entity' },
            'minecraft:entities/sheep/white': { type: 'minecraft:entity' }
        },
        {
            'damage_type/minecraft:is_projectile': { values: ['minecraft:arrow', 'minecraft:mob_projectile'] }
        }
    );
    return plumbing;
};

describe('mob loot', () => {
    describe('the table a mob dies through', () => {
        it('finds the Java table for a Bedrock mob', () => {
            expect(mobLootTableOf(fixture(), 'minecraft:creeper')).toBe('minecraft:entities/creeper');
        });

        it('finds it through the name Bedrock gave the mob instead', () => {
            // The one bridge this module exists for: Java calls it a zombified
            // piglin and the client calls it a zombie pigman.
            expect(mobLootTableOf(fixture(), 'minecraft:zombie_pigman')).toBe('minecraft:entities/zombified_piglin');
        });

        it('passes over the sub-tables a species table references', () => {
            expect(mobLootTableOf(fixture(), 'minecraft:sheep')).toBeUndefined();
        });

        it('has no table for a mob the stack registered none for', () => {
            expect(mobLootTableOf(fixture(), 'minecraft:wolf')).toBeUndefined();
            expect(rollMobDrops(fixture(), 'minecraft:wolf')).toEqual([]);
        });
    });

    describe('the context a condition reads', () => {
        it('credits the kill to the player who landed the blow', () => {
            expect(rollMobDrops(fixture(), 'minecraft:skeleton', { damage: killedByPlayer() })).toEqual([
                { identifier: 'minecraft:bone', count: 1 }
            ]);
            expect(rollMobDrops(fixture(), 'minecraft:skeleton')).toEqual([]);
        });

        it('reads the damage type and its tags off the stack rather than a list here', () => {
            const source = lootDamageSource(fixture(), {
                cause: DamageCause.Projectile,
                attacker: standing('minecraft:skeleton'),
                projectile: standing('minecraft:arrow')
            });

            expect(source?.type).toBe('minecraft:arrow');
            expect(source?.tags).toEqual(['minecraft:is_projectile']);
            // The arrow made contact and the skeleton is answerable, which is
            // the distinction the ghast's music disc turns on.
            expect(source?.directEntity?.type).toBe('minecraft:arrow');
            expect(source?.sourceEntity?.type).toBe('minecraft:skeleton');
        });

        it('names a player’s swing a player attack and a mob’s a mob attack', () => {
            const swung = (type: string) => ({
                cause: DamageCause.Attack,
                attacker: standing(type),
                projectile: null
            });

            expect(lootDamageSource(fixture(), swung('minecraft:player'))?.type).toBe('minecraft:player_attack');
            expect(lootDamageSource(fixture(), swung('minecraft:zombie'))?.type).toBe('minecraft:mob_attack');
        });

        it('rolls a death nothing is on record for rather than reporting one', () => {
            const content = fixture();

            expect(rollMobDrops(content, 'minecraft:creeper')).toEqual([
                { identifier: 'minecraft:gunpowder', count: 1 }
            ]);
            expect(content.loot.diagnostics.entries).toEqual([]);
        });
    });
});

/**
 * The real Java 26.3 entity tables, loaded through `@jsprismarine/packs` the
 * way the server loads them. They need the datapack that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so
 * this half is skipped where that is not on disk.
 */
const javaDatapack = (): Definitions | undefined => {
    const { stack } = resolvePackStack({ vanilla: false, overlay: false });
    const source = stack.find((member) => member.kind === 'datapack');
    return source && loadPacks([source], {}).definitions;
};

const java = javaDatapack();

describe.skipIf(!java)('what Java’s own tables drop', () => {
    /**
     * One content over all 1447 Java tables, shared by every case here.
     *
     * Shared on purpose as well as for the second it saves: each table keeps
     * one random stream and a roll advances it, so the cases below draw from
     * one continuous stream the way a running server does, and the last case
     * can ask whether the whole run reported anything.
     */
    let built: ServerContent | undefined;
    const vanilla = (): ServerContent => {
        built ??= buildServerContent(
            fixtureContentOptions({
                seed: 1234n,
                load: () => ({
                    definitions: {
                        ...fixtureDefinitions(),
                        lootTablesJava: java!.lootTablesJava,
                        // The recipes are here because `furnace_smelt` smelts
                        // through them: a burning cow's beef is cooked by the
                        // same `minecraft:cooked_beef` recipe a furnace uses.
                        recipesJava: java!.recipesJava,
                        tags: new Map([...fixtureDefinitions().tags, ...java!.tags])
                    },
                    diagnostics: []
                })
            })
        );
        return built;
    };

    it('drops a zombie’s rotten flesh, nought to two of it', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:zombie', 300, { damage: killedByPlayer() });

        expect(spread(totalsOf(rolls, 'minecraft:rotten_flesh'))).toEqual({ min: 0, max: 2 });
    });

    it('drops a skeleton’s bones and arrows, nought to two each', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:skeleton', 300, { damage: killedByPlayer() });

        expect(spread(totalsOf(rolls, 'minecraft:bone'))).toEqual({ min: 0, max: 2 });
        expect(spread(totalsOf(rolls, 'minecraft:arrow'))).toEqual({ min: 0, max: 2 });
    });

    it('drops a creeper’s gunpowder, nought to two of it', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:creeper', 300, { damage: killedByPlayer() });

        expect(spread(totalsOf(rolls, 'minecraft:gunpowder'))).toEqual({ min: 0, max: 2 });
    });

    it('drops a cow’s beef one to three and its leather nought to two', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:cow', 300, { damage: killedByPlayer() });

        expect(spread(totalsOf(rolls, 'minecraft:beef'))).toEqual({ min: 1, max: 3 });
        expect(spread(totalsOf(rolls, 'minecraft:leather'))).toEqual({ min: 0, max: 2 });
    });

    it('cooks the meat of a mob that died burning', () => {
        // Java's cow table puts `furnace_smelt` on the beef behind an
        // `is_on_fire` check, and the modifier smelts through the stack's own
        // recipes. With no recipes registered it reported and left the beef
        // raw, which is the one branch this module's own doc comment promises.
        const content = vanilla();
        const onFire = { self: { flags: { is_on_fire: true, is_baby: false } } };

        const burning = rollsOf(content, 'minecraft:cow', 60, { ...onFire, damage: killedByPlayer() });
        const unharmed = rollsOf(content, 'minecraft:cow', 60, { damage: killedByPlayer() });

        expect(spread(totalsOf(burning, 'minecraft:cooked_beef'))).toEqual({ min: 1, max: 3 });
        expect(totalsOf(burning, 'minecraft:beef').every((count) => count === 0)).toBe(true);
        expect(spread(totalsOf(unharmed, 'minecraft:beef'))).toEqual({ min: 1, max: 3 });
        expect(totalsOf(unharmed, 'minecraft:cooked_beef').every((count) => count === 0)).toBe(true);
    });

    it('drops an iron golem’s three to five ingots and nought to two poppies', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:iron_golem', 300);

        expect(spread(totalsOf(rolls, 'minecraft:iron_ingot'))).toEqual({ min: 3, max: 5 });
        expect(spread(totalsOf(rolls, 'minecraft:poppy'))).toEqual({ min: 0, max: 2 });
    });

    it('drops a chicken’s one chicken and nought to two feathers', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:chicken', 300, { damage: killedByPlayer() });

        expect(spread(totalsOf(rolls, 'minecraft:chicken'))).toEqual({ min: 1, max: 1 });
        expect(spread(totalsOf(rolls, 'minecraft:feather'))).toEqual({ min: 0, max: 2 });
    });

    it('drops the wool of the sheep’s own color', () => {
        const unsheared = (color: string) => ({
            self: {
                ...ALIVE_AND_GROWN,
                components: new Map<string, unknown>([['minecraft:sheep/color', color]]),
                typeSpecific: { sheared: false }
            }
        });
        const content = vanilla();

        const white = rollsOf(content, 'minecraft:sheep', 60, unsheared('white'));
        const black = rollsOf(content, 'minecraft:sheep', 60, unsheared('black'));

        expect(spread(totalsOf(white, 'minecraft:white_wool'))).toEqual({ min: 1, max: 1 });
        expect(spread(totalsOf(black, 'minecraft:black_wool'))).toEqual({ min: 1, max: 1 });
        expect(totalsOf(black, 'minecraft:white_wool').every((count) => count === 0)).toBe(true);
        // Its mutton comes with it, one or two, whatever color it was.
        expect(spread(totalsOf(white, 'minecraft:mutton'))).toEqual({ min: 1, max: 2 });
    });

    it('leaves a sheared sheep its mutton and no wool', () => {
        const rolls = rollsOf(vanilla(), 'minecraft:sheep', 60, {
            self: {
                ...ALIVE_AND_GROWN,
                components: new Map<string, unknown>([['minecraft:sheep/color', 'white']]),
                typeSpecific: { sheared: true }
            }
        });

        expect(spread(totalsOf(rolls, 'minecraft:mutton'))).toEqual({ min: 1, max: 2 });
        expect(totalsOf(rolls, 'minecraft:white_wool').every((count) => count === 0)).toBe(true);
    });

    it('raises the count by the looting on the sword that killed it', () => {
        // Java adds a uniform nought to one per level, so Looting III takes a
        // zombie's two rotten flesh to five and no further.
        const content = vanilla();

        const bare = rollsOf(content, 'minecraft:zombie', 400, { damage: killedByPlayer() });
        const looted = rollsOf(content, 'minecraft:zombie', 400, { damage: killedByPlayer(3) });

        expect(spread(totalsOf(bare, 'minecraft:rotten_flesh'))).toEqual({ min: 0, max: 2 });
        expect(spread(totalsOf(looted, 'minecraft:rotten_flesh'))).toEqual({ min: 0, max: 5 });
    });

    it('keeps the player-only drops for a player', () => {
        // A zombie's iron ingot, carrot and potato need the kill credited to
        // a player, at one chance in forty.
        const content = vanilla();
        const rare = ['minecraft:iron_ingot', 'minecraft:carrot', 'minecraft:potato'];

        const byPlayer = rollsOf(content, 'minecraft:zombie', 2000, { damage: killedByPlayer() });
        const byFall = rollsOf(content, 'minecraft:zombie', 2000);

        expect(rare.some((item) => totalsOf(byPlayer, item).some((count) => count > 0))).toBe(true);
        expect(rare.every((item) => totalsOf(byFall, item).every((count) => count === 0))).toBe(true);
    });

    it('reported nothing over any of it', () => {
        // Every roll above went through this one registry, so a condition
        // that reached for a parameter the server did not supply - a flag, a
        // component, a damage source - is on record here.
        expect(vanilla().loot.diagnostics.entries).toEqual([]);
    });
});
