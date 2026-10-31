/**
 * Every family, exercised through the real seam.
 *
 * The suite builds the vanilla registry once with the behaviors attached, and
 * each case dispatches through the item type's own `HookTable` rather than
 * calling a handler directly. That means the attachment rules, the dispatch
 * order and the first-non-undefined contract are under test too, which is
 * where this package's mistakes would live.
 */
import { BehaviorRegistry } from '@jsprismarine/content';
import type { ItemHooks, ItemRegistry, ItemStack, ItemUseResult } from '@jsprismarine/items';
import { ItemStack as Stack, loadItemTypes } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { deferredItemFactory } from './items';
import { registerVanillaItemBehaviors } from './registry';
import type { TestWorld, TestWorldOptions } from './testing';
import { createTestWorld, testBlock, testSource } from './testing';
import type { BlockFace, BlockPosition, WorldActions } from './world';

/**
 * The world every bound behavior closes over, forwarding to whichever double
 * the running test installed.
 *
 * Behaviors bind once at load and the registry is expensive to build, so the
 * world has to be swappable rather than rebuilt per case.
 */
let current: TestWorld = createTestWorld();

const world: WorldActions = {
    blockAt: (position) => current.blockAt(position),
    hardnessOf: (block) => current.hardnessOf(block),
    stateOf: (source) => current.stateOf(source),
    environment: () => current.environment(),
    targetOf: (source) => current.targetOf(source),
    includes: (set, member) => current.includes(set, member),
    transform: (transformer, block) => current.transform(transformer, block),
    effectsOf: (potion) => current.effectsOf(potion),
    random: () => current.random(),
    locate: (destination, origin) => current.locate?.(destination, origin),
    perform: (action) => current.perform(action)
};

const behaviors = new BehaviorRegistry<ItemHooks>();
const items = deferredItemFactory();
registerVanillaItemBehaviors(behaviors, { world, items });

const loaded = loadItemTypes({ behaviors, strict: true });
const registry: ItemRegistry = loaded.registry;
items.bind(registry);

const source = testSource();
const stackOf = (identifier: string, count = 1): ItemStack => new Stack(registry.holder(identifier), count);

const use = (stack: ItemStack, useDuration = 0): ItemUseResult | undefined =>
    stack.type.hooks.dispatchFirst('onUse', { itemStack: stack, source, useDuration });

const useOn = (
    stack: ItemStack,
    block = testBlock('minecraft:stone'),
    blockFace: BlockFace = 'up',
    faceLocation: BlockPosition = { x: 0.5, y: 1, z: 0.5 }
): ItemUseResult | undefined =>
    stack.type.hooks.dispatchFirst('onUseOn', {
        itemStack: stack,
        source,
        useDuration: 0,
        block,
        blockFace,
        faceLocation
    });

const completeUse = (stack: ItemStack, useDuration: number): ItemUseResult | undefined =>
    stack.type.hooks.dispatchFirst('onCompleteUse', { itemStack: stack, source, useDuration });

const consume = (stack: ItemStack): ItemUseResult | undefined =>
    stack.type.hooks.dispatchFirst('onConsume', { itemStack: stack, source });

const hitEntity = (stack: ItemStack, hitEntityTarget = testSource('minecraft:zombie', 2), hadEffect = true): void => {
    stack.type.hooks.dispatch('onHitEntity', { itemStack: stack, source, hitEntity: hitEntityTarget, hadEffect });
};

const mineBlock = (stack: ItemStack, block = testBlock('minecraft:stone')): void => {
    stack.type.hooks.dispatch('onMineBlock', { itemStack: stack, source, block });
};

const withWorld = (options: TestWorldOptions = {}): TestWorld => {
    current = createTestWorld(options);
    return current;
};

beforeEach(() => {
    current = createTestWorld();
});

describe('the load', () => {
    it('resolves the whole vanilla table with every behavior attached', () => {
        expect(loaded.diagnostics).toEqual([]);
        expect(loaded.types.size).toBeGreaterThan(1600);
    });

    it('attaches the mining tool to a pickaxe and not to an apple', () => {
        expect(stackOf('minecraft:diamond_pickaxe').type.hooks.contributors('onMineBlock')).toContain(
            'vanilla:mining_tool'
        );
        expect(stackOf('minecraft:apple').type.hooks.has('onMineBlock')).toBe(false);
    });
});

describe('food and consumables', () => {
    it('eats an apple for its nutrition and leaves nothing behind', () => {
        const recording = withWorld({ state: { foodLevel: 10 } });
        const apple = stackOf('minecraft:apple', 3);
        expect(use(apple)).toEqual({});

        const result = consume(apple);
        expect(recording.performed('feed')).toEqual([{ kind: 'feed', target: source, nutrition: 4, saturation: 2.4 }]);
        expect(result?.stack?.count).toBe(2);
    });

    it('refuses to eat on a full hunger bar, and lets a golden apple through', () => {
        withWorld({ state: { foodLevel: 20 } });
        expect(use(stackOf('minecraft:apple'))).toBeUndefined();
        expect(use(stackOf('minecraft:golden_apple'))).toEqual({});

        withWorld({ state: { foodLevel: 12 } });
        expect(use(stackOf('minecraft:apple'))).toEqual({});
    });

    it('applies the golden apple effects the component declares', () => {
        const recording = withWorld();
        consume(stackOf('minecraft:golden_apple'));
        expect(recording.performed('apply-effects')[0]?.effects).toEqual([
            { id: 'minecraft:regeneration', durationTicks: 100, amplifier: 1, showIcon: true },
            { id: 'minecraft:absorption', durationTicks: 2400, amplifier: 0, showIcon: true }
        ]);
    });

    it('rolls the probability on raw chicken', () => {
        const unlucky = withWorld({ randoms: [0.9] });
        consume(stackOf('minecraft:chicken'));
        expect(unlucky.did('apply-effects')).toBe(false);

        const lucky = withWorld({ randoms: [0.1] });
        consume(stackOf('minecraft:chicken'));
        expect(lucky.performed('apply-effects')[0]?.effects[0]?.id).toBe('minecraft:hunger');
    });

    it('teleports on a chorus fruit and starts its cooldown', () => {
        const recording = withWorld();
        const result = consume(stackOf('minecraft:chorus_fruit'));
        expect(recording.performed('teleport-randomly')).toEqual([
            { kind: 'teleport-randomly', target: source, radius: 8 }
        ]);
        expect(result?.cooldownTicks).toBe(20);
        expect(recording.performed('start-cooldown')[0]?.group).toBe('minecraft:chorus_fruit');
    });

    it('clears every effect with milk and hands back the bucket', () => {
        const recording = withWorld();
        const result = consume(stackOf('minecraft:milk_bucket'));
        expect(recording.performed('remove-effects')).toEqual([{ kind: 'remove-effects', target: source }]);
        expect(result?.stack?.identifier).toBe('minecraft:bucket');
    });

    it('removes one named effect with a honey bottle', () => {
        const recording = withWorld();
        consume(stackOf('minecraft:honey_bottle'));
        expect(recording.performed('remove-effects')[0]?.effects).toEqual({
            kind: 'entries',
            entries: ['minecraft:poison']
        });
    });

    it('hands the bottle over when the stack had more than one', () => {
        const recording = withWorld();
        const result = consume(stackOf('minecraft:honey_bottle', 2));
        expect(result?.stack?.count).toBe(1);
        expect(recording.performed('give-item')[0]?.item.identifier).toBe('minecraft:glass_bottle');
    });

    it('drinks a potion for the effects the registry names, scaled and all', () => {
        const recording = withWorld({
            potions: {
                'minecraft:strength': [{ id: 'minecraft:strength', durationTicks: 3600, amplifier: 0, showIcon: true }]
            }
        });
        const potion = stackOf('minecraft:potion');
        potion.set('minecraft:potion_contents', { potion: 'minecraft:strength' });

        const result = consume(potion);
        expect(recording.performed('apply-effects')[0]?.effects).toEqual([
            { id: 'minecraft:strength', durationTicks: 3600, amplifier: 0, showIcon: true }
        ]);
        expect(result?.stack?.identifier).toBe('minecraft:glass_bottle');
    });

    it('eats a suspicious stew for the effects the stack stored', () => {
        const recording = withWorld();
        const stew = stackOf('minecraft:suspicious_stew');
        stew.set('minecraft:suspicious_stew_effects', [{ id: 'minecraft:night_vision', duration: 100 }]);

        consume(stew);
        expect(recording.performed('apply-effects')[0]?.effects).toEqual([
            { id: 'minecraft:night_vision', durationTicks: 100, amplifier: 0, showIcon: true }
        ]);
    });

    it('drinks an ominous bottle for Bad Omen at its amplifier', () => {
        const recording = withWorld();
        const bottle = stackOf('minecraft:ominous_bottle');
        bottle.set('minecraft:ominous_bottle_amplifier', 3);

        consume(bottle);
        expect(recording.performed('apply-effects')[0]?.effects).toEqual([
            { id: 'minecraft:bad_omen', durationTicks: 120_000, amplifier: 3, showIcon: true }
        ]);
    });
});

describe('tools', () => {
    it('spends the tool damage per block and reports when it breaks', () => {
        const recording = withWorld();
        mineBlock(stackOf('minecraft:diamond_pickaxe'));
        expect(recording.performed('consume-durability')).toEqual([
            { kind: 'consume-durability', source, amount: 1, broke: false }
        ]);

        const sword = stackOf('minecraft:diamond_sword');
        mineBlock(sword);
        expect(recording.performed('consume-durability')[1]?.amount).toBe(2);
    });

    it('spends nothing on an instantly broken block', () => {
        const recording = withWorld({ hardness: { 'minecraft:short_grass': 0 } });
        mineBlock(stackOf('minecraft:diamond_pickaxe'), testBlock('minecraft:short_grass'));
        expect(recording.did('consume-durability')).toBe(false);
    });

    it('spends nothing in creative', () => {
        const recording = withWorld({ state: { creative: true } });
        mineBlock(stackOf('minecraft:diamond_pickaxe'));
        expect(recording.did('consume-durability')).toBe(false);
    });

    it('strips a log with an axe and spends a point of durability', () => {
        const recording = withWorld({
            transforms: {
                'minecraft:axe|minecraft:oak_log': { identifier: 'minecraft:stripped_oak_log', states: { axis: 'y' } }
            }
        });
        const axe = stackOf('minecraft:diamond_axe');
        const result = useOn(axe, testBlock('minecraft:oak_log'));

        expect(recording.performed('place-block')[0]?.placement.identifier).toBe('minecraft:stripped_oak_log');
        expect(recording.performed('play-sound')[0]?.sound).toBe('minecraft:item.axe.strip');
        expect(result?.stack?.get('minecraft:damage')).toBe(1);
    });

    it('declines a block the transformer has no rule for', () => {
        withWorld();
        expect(useOn(stackOf('minecraft:diamond_hoe'), testBlock('minecraft:stone'))).toBeUndefined();
    });

    it('shears an entity and spends a point of durability', () => {
        const target = testSource('minecraft:sheep', 7);
        const recording = withWorld({ target });
        const result = use(stackOf('minecraft:shears'));
        expect(recording.performed('shear-entity')).toEqual([{ kind: 'shear-entity', target }]);
        expect(result?.stack?.get('minecraft:damage')).toBe(1);
    });
});

describe('weapons', () => {
    it('spends the weapon damage per attack', () => {
        const recording = withWorld();
        hitEntity(stackOf('minecraft:diamond_sword'));
        expect(recording.performed('consume-durability')).toEqual([
            { kind: 'consume-durability', source, amount: 1, broke: false }
        ]);
    });

    it('spends nothing on a hit that did not land', () => {
        const recording = withWorld();
        hitEntity(stackOf('minecraft:diamond_sword'), testSource('minecraft:zombie', 2), false);
        expect(recording.did('consume-durability')).toBe(false);
    });

    it('disables the shield on an axe hit for the five seconds the component says', () => {
        const target = testSource('minecraft:player', 9);
        const recording = withWorld();
        hitEntity(stackOf('minecraft:diamond_axe'), target);
        expect(recording.performed('disable-shield')).toEqual([{ kind: 'disable-shield', target, ticks: 100 }]);
    });

    it('sounds the mace smash only after a real fall', () => {
        const grounded = withWorld({ state: { fallDistance: 0 } });
        hitEntity(stackOf('minecraft:mace'));
        expect(grounded.did('play-sound')).toBe(false);

        const falling = withWorld({ state: { fallDistance: 6 } });
        hitEntity(stackOf('minecraft:mace'));
        expect(falling.performed('play-sound')[0]?.sound).toBe('minecraft:mace.smash_ground_heavy');
    });

    it('throws a trident after a long enough draw and keeps it on a short one', () => {
        const short = withWorld();
        expect(completeUse(stackOf('minecraft:trident'), 5)).toBeUndefined();
        expect(short.did('launch-projectile')).toBe(false);

        const thrown = withWorld();
        const result = completeUse(stackOf('minecraft:trident'), 20);
        expect(thrown.performed('launch-projectile')[0]?.identifier).toBe('minecraft:thrown_trident');
        expect(result?.stack?.count).toBe(0);
    });

    it('riptides instead of throwing, and only in water or rain', () => {
        const trident = stackOf('minecraft:trident');
        trident.set('minecraft:enchantments', { 'minecraft:riptide': 2 });

        const dry = withWorld({ state: { inWaterOrRain: false } });
        expect(completeUse(trident, 20)).toBeUndefined();
        expect(dry.did('launch-projectile')).toBe(false);

        const wet = withWorld({ state: { inWaterOrRain: true } });
        const result = completeUse(trident, 20);
        expect(wet.performed('play-sound')[0]?.sound).toBe('minecraft:item.trident.riptide_2');
        expect(wet.did('launch-projectile')).toBe(false);
        expect(result?.stack?.count).toBe(1);
    });

    it('raises a shield for the delay the component states', () => {
        const recording = withWorld();
        expect(use(stackOf('minecraft:shield'))).toEqual({});
        expect(recording.performed('blocking')).toEqual([{ kind: 'blocking', source, active: true, delayTicks: 5 }]);
    });

    it('sounds a spear when its charge starts', () => {
        const recording = withWorld();
        expect(use(stackOf('minecraft:copper_spear'))).toEqual({});
        expect(recording.did('play-sound')).toBe(true);
    });
});

describe('armor and equipment', () => {
    it('swaps a chestplate into the chest slot', () => {
        const recording = withWorld();
        expect(use(stackOf('minecraft:diamond_chestplate'))).toEqual({});
        expect(recording.performed('equip')[0]).toMatchObject({ target: source, slot: 'chest' });
    });

    it('puts a saddle on an entity that allows it, and takes one off the stack', () => {
        const target = testSource('minecraft:pig', 4);
        const recording = withWorld({ target, tags: { 'minecraft:can_equip_saddle': ['minecraft:pig'] } });
        const result = use(stackOf('minecraft:saddle', 2));
        expect(recording.performed('equip')[0]).toMatchObject({ target, slot: 'saddle' });
        expect(result?.stack?.count).toBe(1);
    });

    it('leaves an entity the equipment does not allow alone', () => {
        const target = testSource('minecraft:cow', 5);
        withWorld({ target, tags: { 'minecraft:can_equip_saddle': ['minecraft:pig'] } });
        expect(use(stackOf('minecraft:saddle'))).toBeUndefined();
    });

    it('does not swap a shield in, because its component says it is not swappable', () => {
        const recording = withWorld();
        use(stackOf('minecraft:shield'));
        expect(recording.did('equip')).toBe(false);
    });
});

describe('launchers and throwables', () => {
    it('shoots an arrow with the power the draw earned', () => {
        const recording = withWorld();
        const result = completeUse(stackOf('minecraft:bow'), 20);
        const shot = recording.performed('launch-projectile')[0];
        expect(shot?.identifier).toBe('minecraft:arrow');
        expect(shot?.power).toBe(3);
        expect(shot?.data).toMatchObject({ critical: true });
        expect(result?.stack?.get('minecraft:damage')).toBe(1);
    });

    it('refuses a draw too short to matter', () => {
        const recording = withWorld();
        expect(completeUse(stackOf('minecraft:bow'), 1)).toBeUndefined();
        expect(recording.did('launch-projectile')).toBe(false);
    });

    it('charges a crossbow and then fires what it holds', () => {
        const charging = withWorld();
        const charged = completeUse(stackOf('minecraft:crossbow'), 25)?.stack;
        expect(charged?.get('minecraft:charged_projectiles')).toEqual([{ id: 'minecraft:arrow', count: 1 }]);
        expect(charging.performed('play-sound')[0]?.sound).toBe('minecraft:item.crossbow.loading_end');

        const firing = withWorld();
        const fired = use(charged!);
        expect(firing.performed('launch-projectile')).toHaveLength(1);
        expect(fired?.stack?.get('minecraft:charged_projectiles')).toEqual([]);
    });

    it('takes Quick Charge off the crossbow draw', () => {
        withWorld();
        const quick = stackOf('minecraft:crossbow');
        quick.set('minecraft:enchantments', { 'minecraft:quick_charge': 3 });
        expect(completeUse(quick, 10)).toBeDefined();
        expect(completeUse(stackOf('minecraft:crossbow'), 10)).toBeUndefined();
    });

    it('fires three bolts with Multishot', () => {
        const recording = withWorld();
        const multishot = stackOf('minecraft:crossbow');
        multishot.set('minecraft:enchantments', { 'minecraft:multishot': 1 });
        multishot.set('minecraft:charged_projectiles', [{ id: 'minecraft:arrow', count: 1 }]);
        use(multishot);
        expect(recording.performed('launch-projectile')).toHaveLength(3);
    });

    it('throws a snowball and takes one off the stack', () => {
        const recording = withWorld();
        const result = use(stackOf('minecraft:snowball', 16));
        expect(recording.performed('launch-projectile')[0]?.identifier).toBe('minecraft:snowball');
        expect(result?.stack?.count).toBe(15);
    });

    it('carries the potion contents onto a thrown splash potion', () => {
        const recording = withWorld();
        const splash = stackOf('minecraft:splash_potion');
        splash.set('minecraft:potion_contents', { potion: 'minecraft:harming' });
        use(splash);
        expect(recording.performed('launch-projectile')[0]?.data).toEqual({
            'minecraft:potion_contents': { potion: 'minecraft:harming' }
        });
    });

    it('waits out the ender pearl cooldown', () => {
        const ready = withWorld();
        expect(use(stackOf('minecraft:ender_pearl'))?.cooldownTicks).toBe(20);
        expect(ready.performed('start-cooldown')[0]?.group).toBe('minecraft:ender_pearl');

        withWorld({ state: { cooldownGroups: ['minecraft:ender_pearl'] } });
        expect(use(stackOf('minecraft:ender_pearl'))).toBeUndefined();
    });

    it('launches a firework rocket and attaches it to a glider', () => {
        const standing = withWorld();
        use(stackOf('minecraft:firework_rocket', 2));
        expect(standing.performed('spawn-entity')[0]?.attachedTo).toBeUndefined();

        const gliding = withWorld({ state: { gliding: true } });
        const result = use(stackOf('minecraft:firework_rocket', 2));
        expect(gliding.performed('spawn-entity')[0]?.attachedTo).toEqual(source);
        expect(result?.stack?.count).toBe(1);
    });

    it('casts and then reels in a fishing rod', () => {
        const casting = withWorld();
        const cast = use(stackOf('minecraft:fishing_rod'));
        expect(casting.performed('fishing')).toEqual([{ kind: 'fishing', source, cast: true }]);
        expect(cast?.stack?.get('minecraft:damage')).toBe(0);

        const reeling = withWorld({ state: { cooldownGroups: ['minecraft:fishing_rod'] } });
        const reeled = use(stackOf('minecraft:fishing_rod'));
        expect(reeling.performed('fishing')[0]?.cast).toBe(false);
        expect(reeled?.stack?.get('minecraft:damage')).toBe(1);
    });
});

describe('buckets', () => {
    it('picks a water source up and becomes a water bucket', () => {
        const recording = withWorld();
        const result = useOn(stackOf('minecraft:bucket'), testBlock('minecraft:water'));
        expect(recording.did('break-block')).toBe(true);
        expect(result?.stack?.identifier).toBe('minecraft:water_bucket');
    });

    it('declines a block that holds no fluid', () => {
        withWorld();
        expect(useOn(stackOf('minecraft:bucket'), testBlock('minecraft:stone'))).toBeUndefined();
    });

    it('empties a lava bucket against the face and hands back the bucket', () => {
        const recording = withWorld();
        const result = useOn(stackOf('minecraft:lava_bucket'), testBlock('minecraft:stone'), 'up');
        expect(recording.performed('place-block')[0]).toMatchObject({
            position: { x: 0, y: 65, z: 0 },
            placement: { identifier: 'minecraft:lava' }
        });
        expect(result?.stack?.identifier).toBe('minecraft:bucket');
    });

    it('keeps the filled bucket in creative', () => {
        withWorld({ state: { creative: true } });
        expect(useOn(stackOf('minecraft:water_bucket'), testBlock('minecraft:stone'))?.stack?.identifier).toBe(
            'minecraft:water_bucket'
        );
    });

    it('pours powder snow out of its own bucket', () => {
        const recording = withWorld();
        useOn(stackOf('minecraft:powder_snow_bucket'), testBlock('minecraft:stone'));
        expect(recording.performed('place-block')[0]?.placement.identifier).toBe('minecraft:powder_snow');
    });

    it('releases a bucketed fish with its stored data', () => {
        const recording = withWorld();
        const bucket = stackOf('minecraft:tropical_fish_bucket');
        bucket.set('minecraft:bucket_entity_data', { Variant: 65536 });

        const result = useOn(bucket, testBlock('minecraft:stone'));
        expect(recording.performed('place-block')[0]?.placement.identifier).toBe('minecraft:water');
        expect(recording.performed('spawn-entity')[0]).toMatchObject({
            identifier: 'minecraft:tropical_fish',
            data: { Variant: 65536 }
        });
        expect(result?.stack?.identifier).toBe('minecraft:bucket');
    });

    it('fills a glass bottle from water', () => {
        withWorld();
        expect(useOn(stackOf('minecraft:glass_bottle'), testBlock('minecraft:water'))?.stack?.identifier).toBe(
            'minecraft:potion'
        );
    });
});

describe('fire, fertilizing and the other engine interactions', () => {
    it('lights a block with flint and steel and spends a point of durability', () => {
        const recording = withWorld();
        const result = useOn(stackOf('minecraft:flint_and_steel'), testBlock('minecraft:netherrack'));
        expect(recording.performed('ignite')).toEqual([
            { kind: 'ignite', position: { x: 0, y: 64, z: 0 }, face: 'up' }
        ]);
        expect(result?.stack?.get('minecraft:damage')).toBe(1);
    });

    it('lights a block with a fire charge and spends the charge', () => {
        withWorld();
        expect(useOn(stackOf('minecraft:fire_charge', 4), testBlock('minecraft:netherrack'))?.stack?.count).toBe(3);
    });

    it('fertilizes with bone meal', () => {
        const recording = withWorld();
        const result = useOn(stackOf('minecraft:bone_meal', 8), testBlock('minecraft:wheat'));
        expect(recording.performed('fertilize')).toEqual([{ kind: 'fertilize', position: { x: 0, y: 64, z: 0 } }]);
        expect(result?.stack?.count).toBe(7);
    });

    it('names an entity with a name tag that has a name', () => {
        const target = testSource('minecraft:cow', 3);
        const recording = withWorld({ target });

        const blank = stackOf('minecraft:name_tag');
        expect(use(blank)).toBeUndefined();

        const named = stackOf('minecraft:name_tag');
        named.set('minecraft:custom_name', 'Bessie');
        use(named);
        expect(recording.performed('name-entity')).toEqual([{ kind: 'name-entity', target, name: 'Bessie' }]);
    });

    it('leashes an entity and knots a lead on a fence', () => {
        const target = testSource('minecraft:cow', 3);
        const leashing = withWorld({ target });
        use(stackOf('minecraft:lead'));
        expect(leashing.performed('attach-lead')).toEqual([{ kind: 'attach-lead', source, target }]);

        const knotting = withWorld({ tags: { 'minecraft:fences': ['minecraft:oak_fence'] } });
        useOn(stackOf('minecraft:lead'), testBlock('minecraft:oak_fence'));
        expect(knotting.performed('spawn-entity')[0]?.identifier).toBe('minecraft:leash_knot');
    });

    it('dyes an entity the color the component names', () => {
        const target = testSource('minecraft:sheep', 6);
        const recording = withWorld({ target });
        const result = use(stackOf('minecraft:red_dye', 3));
        expect(recording.performed('dye-entity')).toEqual([{ kind: 'dye-entity', target, color: 'red' }]);
        expect(result?.stack?.count).toBe(2);
    });

    it('waxes copper when the transformer has a rule', () => {
        const recording = withWorld({
            transforms: {
                'minecraft:honeycomb|minecraft:copper_block': {
                    identifier: 'minecraft:waxed_copper_block',
                    states: {}
                }
            }
        });
        useOn(stackOf('minecraft:honeycomb'), testBlock('minecraft:copper_block'));
        expect(recording.performed('place-block')[0]?.placement.identifier).toBe('minecraft:waxed_copper_block');
    });

    it('brushes a block and spends durability only when the stroke finishes', () => {
        const recording = withWorld();
        const brush = stackOf('minecraft:brush');
        expect(useOn(brush, testBlock('minecraft:suspicious_sand'))).toEqual({});
        expect(recording.performed('brush')).toHaveLength(1);
        expect(recording.did('consume-durability')).toBe(false);

        expect(completeUse(brush, 10)?.stack?.get('minecraft:damage')).toBe(1);
    });
});

describe('navigation', () => {
    it('binds a compass to a lodestone', () => {
        withWorld();
        const bound = useOn(stackOf('minecraft:compass'), testBlock('minecraft:lodestone'))?.stack;
        expect(bound?.get('minecraft:lodestone_tracker')).toMatchObject({ tracked: true });
        expect(useOn(stackOf('minecraft:compass'), testBlock('minecraft:stone'))).toBeUndefined();
    });

    it('sounds the spyglass but leaves the zoom to the client', () => {
        const recording = withWorld();
        expect(use(stackOf('minecraft:spyglass'))).toEqual({});
        expect(recording.performed('play-sound')[0]?.sound).toBe('minecraft:item.spyglass.use');
    });

    it('throws an eye of ender toward the stronghold the world locates', () => {
        const throwing = withWorld({ structures: { 'minecraft:eye_of_ender_located': { x: 400, y: 0, z: -96 } } });
        const result = use(stackOf('minecraft:ender_eye', 2));
        expect(throwing.performed('signal')[0]).toMatchObject({
            source,
            target: { x: 400, y: 0, z: -96 },
            item: { identifier: 'minecraft:ender_eye', count: 1 }
        });
        expect(result?.stack?.count).toBe(1);
    });

    it('keeps the eye when no stronghold is in range, and spends none in creative', () => {
        // Java's `EnderEyeItem.use` answers CONSUME when `findNearestMapStructure` finds
        // nothing: the click is taken, nothing flies, nothing is spent.
        const nowhere = withWorld();
        expect(use(stackOf('minecraft:ender_eye', 2))).toEqual({});
        expect(nowhere.did('signal')).toBe(false);

        withWorld({
            state: { creative: true },
            structures: { 'minecraft:eye_of_ender_located': { x: 40, y: 0, z: 0 } }
        });
        expect(use(stackOf('minecraft:ender_eye', 2))?.stack?.count).toBe(2);
    });

    it('leaves a frame to the block family', () => {
        // The portal block family's `onPlayerInteract` takes the click on a frame before any
        // item hook runs, so the item declines a frame rather than filling it a second way.
        const filling = withWorld();
        const frame = testBlock('minecraft:end_portal_frame', { x: 1, y: 64, z: 1 }, { end_portal_eye_bit: false });
        expect(useOn(stackOf('minecraft:ender_eye', 2), frame)).toBeUndefined();
        expect(filling.performed('place-block')).toHaveLength(0);
    });

    it('creates a map from an empty one and leaves a filled one alone', () => {
        const recording = withWorld();
        const result = use(stackOf('minecraft:empty_map', 2));
        expect(recording.performed('map')[0]?.operation).toBe('create');
        expect(result?.stack?.count).toBe(1);

        withWorld();
        expect(use(stackOf('minecraft:filled_map'))).toBeUndefined();
    });
});

describe('placement', () => {
    it('spawns what a spawn egg names, against the face', () => {
        const recording = withWorld();
        const result = useOn(stackOf('minecraft:zombie_spawn_egg', 5));
        expect(recording.performed('spawn-entity')[0]).toMatchObject({
            identifier: 'minecraft:zombie',
            position: { x: 0.5, y: 65, z: 0.5 }
        });
        expect(result?.stack?.count).toBe(4);
    });

    it('spawns a boat with the wood it is made of as a variant', () => {
        const recording = withWorld();
        useOn(stackOf('minecraft:oak_chest_boat'));
        expect(recording.performed('spawn-entity')[0]).toMatchObject({
            identifier: 'minecraft:chest_boat',
            data: { variant: 'oak' }
        });
    });

    it('spawns the entity a minecart, crystal or stand names outright', () => {
        const recording = withWorld();
        useOn(stackOf('minecraft:hopper_minecart'));
        useOn(stackOf('minecraft:end_crystal'));
        expect(recording.performed('spawn-entity').map((action) => action.identifier)).toEqual([
            'minecraft:minecart',
            'minecraft:end_crystal'
        ]);
    });

    it('places a standing banner on a top face and a wall banner on a side', () => {
        const standing = withWorld();
        useOn(stackOf('minecraft:banner'), testBlock('minecraft:stone'), 'up');
        expect(standing.performed('place-block')[0]?.placement.identifier).toBe('minecraft:standing_banner');

        const wall = withWorld();
        useOn(stackOf('minecraft:banner'), testBlock('minecraft:stone'), 'north');
        expect(wall.performed('place-block')[0]?.placement.identifier).toBe('minecraft:wall_banner');
    });
});

describe('books, horns and bundles', () => {
    it('opens the editor for a book and quill', () => {
        const recording = withWorld();
        expect(use(stackOf('minecraft:writable_book'))).toEqual({});
        expect(recording.performed('open-screen')[0]?.screen).toBe('minecraft:book_edit');
    });

    it('opens a written book for reading', () => {
        const recording = withWorld();
        use(stackOf('minecraft:written_book'));
        expect(recording.performed('open-screen')[0]?.screen).toBe('minecraft:book_read');
    });

    it('plays a goat horn and then waits out its cooldown', () => {
        const ready = withWorld();
        expect(use(stackOf('minecraft:goat_horn'))?.cooldownTicks).toBe(140);
        expect(ready.performed('play-sound')[0]?.sound).toContain('goat_horn');

        withWorld({ state: { cooldownGroups: ['minecraft:goat_horn'] } });
        expect(use(stackOf('minecraft:goat_horn'))).toBeUndefined();
    });

    it('opens a bundle as a container', () => {
        const recording = withWorld();
        use(stackOf('minecraft:bundle'));
        expect(recording.performed('open-screen')[0]?.screen).toBe('minecraft:bundle');
    });
});

describe('items with no behavior', () => {
    it('leaves a plain material and a block item with no hooks at all', () => {
        for (const identifier of ['minecraft:iron_ingot', 'minecraft:stone', 'minecraft:oak_planks']) {
            const type = registry.get(identifier)!;
            for (const hook of ['onUse', 'onUseOn', 'onConsume', 'onHitEntity', 'onMineBlock'] as const) {
                expect(type.hooks.has(hook), `${identifier} ${hook}`).toBe(false);
            }
        }
    });
});
