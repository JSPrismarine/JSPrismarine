import { DiagnosticCollector, rootContext } from '@jsprismarine/predicates';
import { reportProgress } from '../../../.test/reportProgress';
import type { BlockState, EntityView, ItemStack, Vec3 } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { EvaluationServices } from './events';
import { TRIGGER_TYPES, parseTrigger } from './triggers';
import type { TriggerEvents, TriggerName } from './triggers';

const stack = (id: string, count = 1, components: Readonly<Record<string, unknown>> = {}): ItemStack => ({
    id,
    count,
    components: new Map(Object.entries(components))
});

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const being = (type: string, extra: Partial<EntityView> = {}): EntityView => ({
    type,
    position: at(0, 64, 0),
    ...extra
});

const player = being('minecraft:player');

const block = (name: string, properties?: Readonly<Record<string, string>>): BlockState => ({ name, properties });

/** Compiles one trigger and runs it against an event, with nothing but a diagnostic collector behind it. */
const fire = <K extends TriggerName>(
    trigger: K,
    conditions: unknown,
    event: TriggerEvents[K],
    services: Partial<EvaluationServices> = {}
): { readonly matched: boolean; readonly errors: readonly string[] } => {
    const diagnostics = new DiagnosticCollector();
    const test = parseTrigger(trigger, conditions, rootContext({ diagnostics, path: trigger }));
    const matched = test(event, { ...services, diagnostics });
    return { matched, errors: diagnostics.errors.map((entry) => `${entry.path}: ${entry.message}`) };
};

/** The `player` condition every trigger but `impossible` accepts, written as a loot condition. */
const isType = (type: string): unknown => ({
    type: 'minecraft:entity_properties',
    entity: 'this',
    predicate: { 'minecraft:entity_type': type }
});

describe('the trigger registry', () => {
    it('registers a parser for every one of them', () => {
        const context = rootContext();

        for (const trigger of TRIGGER_TYPES) {
            expect(typeof parseTrigger(trigger, {}, context)).toBe('function');
        }
        reportProgress(`${TRIGGER_TYPES.length} advancement trigger types have parsers.`);
    });
});

describe('the player field', () => {
    it('is shared by every trigger except impossible', () => {
        const conditions = { player: isType('minecraft:villager') };

        expect(fire('tick', conditions, { player }).matched).toBe(false);
        expect(fire('tick', { player: isType('minecraft:player') }, { player }).matched).toBe(true);
    });

    it('passes when the field is absent', () => {
        expect(fire('tick', {}, { player }).matched).toBe(true);
    });
});

describe('the triggers that carry only a player', () => {
    it.each([
        'location',
        'slept_in_bed',
        'tick',
        'hero_of_the_village',
        'voluntary_exile',
        'avoid_vibration',
        'started_riding'
    ] as const)('%s fires for the player it names', (trigger) => {
        expect(fire(trigger, { player: isType('minecraft:player') }, { player }).matched).toBe(true);
    });

    it('impossible never fires', () => {
        expect(fire('impossible', {}, { player }).matched).toBe(false);
    });
});

describe('the kill triggers', () => {
    const event: TriggerEvents['player_killed_entity'] = {
        player,
        entity: being('minecraft:creeper'),
        damageSource: { type: 'minecraft:player_attack', tags: ['minecraft:is_player_attack'] }
    };

    it.each(['player_killed_entity', 'entity_killed_player', 'kill_mob_near_sculk_catalyst'] as const)(
        '%s matches the other entity',
        (trigger) => {
            expect(fire(trigger, { entity: isType('minecraft:creeper') }, event).matched).toBe(true);
            expect(fire(trigger, { entity: isType('minecraft:zombie') }, event).matched).toBe(false);
        }
    );

    it('matches the killing blow by damage type', () => {
        const conditions = { killing_blow: { tags: [{ id: 'minecraft:is_player_attack', expected: true }] } };

        expect(fire('player_killed_entity', conditions, event).matched).toBe(true);
    });
});

describe('inventory_changed', () => {
    const event: TriggerEvents['inventory_changed'] = {
        player,
        inventory: [stack('minecraft:stone', 3), undefined, stack('minecraft:dirt', 64)],
        changed: stack('minecraft:stone', 3)
    };

    it('tests a single item predicate against the stack that changed', () => {
        expect(fire('inventory_changed', { items: [{ items: 'minecraft:stone' }] }, event).matched).toBe(true);
        expect(fire('inventory_changed', { items: [{ items: 'minecraft:dirt' }] }, event).matched).toBe(false);
    });

    it('tests several item predicates against the whole inventory', () => {
        const conditions = { items: [{ items: 'minecraft:stone' }, { items: 'minecraft:dirt' }] };

        expect(fire('inventory_changed', conditions, event).matched).toBe(true);
        expect(
            fire(
                'inventory_changed',
                { items: [{ items: 'minecraft:stone' }, { items: 'minecraft:gold_ingot' }] },
                event
            ).matched
        ).toBe(false);
    });

    it('counts occupied, full and empty slots for the slots field', () => {
        expect(fire('inventory_changed', { slots: { occupied: 2, empty: 1, full: 1 } }, event).matched).toBe(true);
        expect(fire('inventory_changed', { slots: { empty: 0 } }, event).matched).toBe(false);
    });
});

describe('the recipe triggers', () => {
    it('recipe_unlocked matches the unlocked recipe', () => {
        const event: TriggerEvents['recipe_unlocked'] = { player, recipe: 'minecraft:stone_slab' };

        expect(fire('recipe_unlocked', { recipes: 'minecraft:stone_slab' }, event).matched).toBe(true);
        expect(fire('recipe_unlocked', { recipes: 'minecraft:stone_stairs' }, event).matched).toBe(false);
    });

    it.each(['recipe_crafted', 'crafter_recipe_crafted'] as const)(
        '%s matches the recipe and its ingredients',
        (trigger) => {
            const event: TriggerEvents['recipe_crafted'] = {
                player,
                recipe: 'minecraft:cake',
                ingredients: [stack('minecraft:milk_bucket'), stack('minecraft:wheat', 3), stack('minecraft:egg')]
            };

            expect(fire(trigger, { recipes: 'minecraft:cake' }, event).matched).toBe(true);
            expect(
                fire(trigger, { recipes: 'minecraft:cake', ingredients: [{ items: 'minecraft:egg' }] }, event).matched
            ).toBe(true);
            expect(
                fire(trigger, { recipes: 'minecraft:cake', ingredients: [{ items: 'minecraft:diamond' }] }, event)
                    .matched
            ).toBe(false);
        }
    );

    it('recipe_crafted needs a distinct stack per ingredient predicate', () => {
        const event: TriggerEvents['recipe_crafted'] = {
            player,
            recipe: 'minecraft:cake',
            ingredients: [stack('minecraft:egg')]
        };
        const conditions = {
            recipes: 'minecraft:cake',
            ingredients: [{ items: 'minecraft:egg' }, { items: 'minecraft:egg' }]
        };

        expect(fire('recipe_crafted', conditions, event).matched).toBe(false);
    });
});

describe('the damage triggers', () => {
    const source = { type: 'minecraft:arrow', sourceEntity: being('minecraft:skeleton') };

    it('entity_hurt_player reads the dealt and taken amounts', () => {
        const event: TriggerEvents['entity_hurt_player'] = {
            player,
            damageSource: source,
            dealt: 6,
            taken: 4,
            blocked: false
        };

        expect(fire('entity_hurt_player', { damage: { dealt: { min: 5 }, taken: { max: 5 } } }, event).matched).toBe(
            true
        );
        expect(fire('entity_hurt_player', { damage: { blocked: true } }, event).matched).toBe(false);
        expect(
            fire(
                'entity_hurt_player',
                { damage: { source_entity: { 'minecraft:entity_type': 'minecraft:skeleton' } } },
                event
            ).matched
        ).toBe(true);
    });

    it('player_hurt_entity also matches the entity that was hit', () => {
        const event: TriggerEvents['player_hurt_entity'] = {
            player,
            entity: being('minecraft:blaze'),
            damageSource: source,
            dealt: 3,
            taken: 3,
            blocked: false
        };

        expect(fire('player_hurt_entity', { entity: isType('minecraft:blaze') }, event).matched).toBe(true);
        expect(fire('player_hurt_entity', { entity: isType('minecraft:ghast') }, event).matched).toBe(false);
    });
});

describe('the single-stack triggers', () => {
    it.each(['filled_bucket', 'consume_item', 'used_totem', 'shot_crossbow', 'using_item'] as const)(
        '%s matches the stack it carries',
        (trigger) => {
            const event: TriggerEvents['consume_item'] = { player, item: stack('minecraft:golden_apple') };

            expect(fire(trigger, { item: { items: 'minecraft:golden_apple' } }, event).matched).toBe(true);
            expect(fire(trigger, { item: { items: 'minecraft:apple' } }, event).matched).toBe(false);
        }
    );
});

describe('the block triggers', () => {
    it.each(['enter_block', 'slide_down_block'] as const)('%s matches the block and its state', (trigger) => {
        const event: TriggerEvents['enter_block'] = { player, blockState: block('minecraft:honey_block') };

        expect(fire(trigger, { blocks: 'minecraft:honey_block' }, event).matched).toBe(true);
        expect(fire(trigger, { blocks: 'minecraft:slime_block' }, event).matched).toBe(false);
        expect(fire(trigger, {}, event).matched).toBe(true);
    });

    it.each(['placed_block', 'item_used_on_block', 'allay_drop_item_on_block'] as const)(
        '%s evaluates its location condition against the block',
        (trigger) => {
            const event: TriggerEvents['placed_block'] = {
                player,
                origin: at(10, 70, -4),
                blockState: block('minecraft:creaking_heart', { creaking_heart_state: 'awake' }),
                tool: stack('minecraft:creaking_heart')
            };
            const conditions = {
                location: {
                    type: 'minecraft:match_block',
                    blocks: 'minecraft:creaking_heart',
                    state: { creaking_heart_state: 'awake' }
                }
            };

            expect(fire(trigger, conditions, event).matched).toBe(true);
            expect(
                fire(trigger, { location: { type: 'minecraft:match_block', blocks: 'minecraft:stone' } }, event).matched
            ).toBe(false);
        }
    );

    it.each(['default_block_use', 'any_block_use'] as const)('%s evaluates its location condition', (trigger) => {
        const event: TriggerEvents['any_block_use'] = {
            player,
            origin: at(0, 64, 0),
            blockState: block('minecraft:lectern')
        };

        expect(
            fire(trigger, { location: { type: 'minecraft:match_block', blocks: 'minecraft:lectern' } }, event).matched
        ).toBe(true);
        expect(
            fire(trigger, { location: { type: 'minecraft:match_block', blocks: 'minecraft:anvil' } }, event).matched
        ).toBe(false);
    });

    it('bee_nest_destroyed reads the block, the tool and the bee count', () => {
        const event: TriggerEvents['bee_nest_destroyed'] = {
            player,
            blockState: block('minecraft:bee_nest'),
            item: stack('minecraft:iron_axe'),
            beesInside: 3
        };
        const conditions = {
            blocks: 'minecraft:bee_nest',
            item: { items: 'minecraft:iron_axe' },
            num_bees_inside: 3
        };

        expect(fire('bee_nest_destroyed', conditions, event).matched).toBe(true);
        expect(fire('bee_nest_destroyed', { ...conditions, num_bees_inside: 2 }, event).matched).toBe(false);
    });
});

describe('the entity triggers', () => {
    it.each(['summoned_entity', 'tame_animal'] as const)('%s matches the entity it names', (trigger) => {
        const event: TriggerEvents['tame_animal'] = { player, entity: being('minecraft:wolf') };

        expect(fire(trigger, { entity: isType('minecraft:wolf') }, event).matched).toBe(true);
        expect(fire(trigger, { entity: isType('minecraft:cat') }, event).matched).toBe(false);
    });

    it('bred_animals matches both parents and the child', () => {
        const event: TriggerEvents['bred_animals'] = {
            player,
            parent: being('minecraft:horse'),
            partner: being('minecraft:donkey'),
            child: being('minecraft:mule')
        };

        expect(fire('bred_animals', { child: isType('minecraft:mule') }, event).matched).toBe(true);
        expect(fire('bred_animals', { partner: isType('minecraft:horse') }, event).matched).toBe(false);
    });

    it('bred_animals fails a child condition when the breeding produced none', () => {
        const event: TriggerEvents['bred_animals'] = {
            player,
            parent: being('minecraft:mule'),
            partner: being('minecraft:mule')
        };

        expect(fire('bred_animals', { child: isType('minecraft:mule') }, event).matched).toBe(false);
        expect(fire('bred_animals', {}, event).matched).toBe(true);
    });

    it('cured_zombie_villager matches both sides of the cure', () => {
        const event: TriggerEvents['cured_zombie_villager'] = {
            player,
            zombie: being('minecraft:zombie_villager'),
            villager: being('minecraft:villager')
        };

        expect(
            fire(
                'cured_zombie_villager',
                { zombie: isType('minecraft:zombie_villager'), villager: isType('minecraft:villager') },
                event
            ).matched
        ).toBe(true);
        expect(fire('cured_zombie_villager', { villager: isType('minecraft:zombie') }, event).matched).toBe(false);
    });

    it('villager_trade matches the villager and the stack received', () => {
        const event: TriggerEvents['villager_trade'] = {
            player,
            villager: being('minecraft:villager'),
            item: stack('minecraft:emerald', 4)
        };

        expect(fire('villager_trade', { item: { items: 'minecraft:emerald' } }, event).matched).toBe(true);
        expect(fire('villager_trade', { villager: isType('minecraft:wandering_trader') }, event).matched).toBe(false);
    });

    it.each(['thrown_item_picked_up_by_entity', 'thrown_item_picked_up_by_player'] as const)(
        '%s matches the stack and the other party',
        (trigger) => {
            const event: TriggerEvents['thrown_item_picked_up_by_entity'] = {
                player,
                item: stack('minecraft:bone'),
                entity: being('minecraft:wolf')
            };

            expect(
                fire(trigger, { item: { items: 'minecraft:bone' }, entity: isType('minecraft:wolf') }, event).matched
            ).toBe(true);
            expect(fire(trigger, { entity: isType('minecraft:cat') }, event).matched).toBe(false);
        }
    );

    it.each(['player_interacted_with_entity', 'player_sheared_equipment'] as const)(
        '%s matches the held stack and the entity',
        (trigger) => {
            const event: TriggerEvents['player_interacted_with_entity'] = {
                player,
                item: stack('minecraft:shears'),
                entity: being('minecraft:sheep')
            };

            expect(
                fire(trigger, { item: { items: 'minecraft:shears' }, entity: isType('minecraft:sheep') }, event).matched
            ).toBe(true);
            expect(fire(trigger, { item: { items: 'minecraft:bucket' } }, event).matched).toBe(false);
        }
    );

    it('lightning_strike matches the bolt and any bystander', () => {
        const event: TriggerEvents['lightning_strike'] = {
            player,
            lightning: being('minecraft:lightning_bolt'),
            bystanders: [being('minecraft:skeleton_horse'), being('minecraft:pig')]
        };

        expect(fire('lightning_strike', { bystander: isType('minecraft:skeleton_horse') }, event).matched).toBe(true);
        expect(fire('lightning_strike', { bystander: isType('minecraft:cow') }, event).matched).toBe(false);
        expect(fire('lightning_strike', { lightning: isType('minecraft:lightning_bolt') }, event).matched).toBe(true);
    });

    it('target_hit reads the signal strength and the projectile', () => {
        const event: TriggerEvents['target_hit'] = {
            player,
            signalStrength: 15,
            projectile: being('minecraft:arrow')
        };

        expect(fire('target_hit', { signal_strength: 15, projectile: isType('minecraft:arrow') }, event).matched).toBe(
            true
        );
        expect(fire('target_hit', { signal_strength: { min: 16 } }, event).matched).toBe(false);
    });

    it('channeled_lightning needs every victim condition to find a victim', () => {
        const event: TriggerEvents['channeled_lightning'] = {
            player,
            victims: [being('minecraft:pig'), being('minecraft:cow')]
        };

        expect(
            fire('channeled_lightning', { victims: [isType('minecraft:pig'), isType('minecraft:cow')] }, event).matched
        ).toBe(true);
        expect(fire('channeled_lightning', { victims: [isType('minecraft:sheep')] }, event).matched).toBe(false);
    });

    it('killed_by_arrow needs a distinct victim per condition and counts the types', () => {
        const event: TriggerEvents['killed_by_arrow'] = {
            player,
            victims: [being('minecraft:pig'), being('minecraft:pig'), being('minecraft:cow')],
            firedFromWeapon: stack('minecraft:crossbow')
        };

        expect(
            fire('killed_by_arrow', { victims: [isType('minecraft:pig'), isType('minecraft:pig')] }, event).matched
        ).toBe(true);
        expect(
            fire('killed_by_arrow', { victims: [isType('minecraft:cow'), isType('minecraft:cow')] }, event).matched
        ).toBe(false);
        expect(fire('killed_by_arrow', { unique_entity_types: 2 }, event).matched).toBe(true);
        expect(fire('killed_by_arrow', { fired_from_weapon: { items: 'minecraft:bow' } }, event).matched).toBe(false);
    });
});

describe('the measurement triggers', () => {
    it('enchanted_item reads the stack and the level cost', () => {
        const event: TriggerEvents['enchanted_item'] = { player, item: stack('minecraft:diamond_sword'), levels: 30 };

        expect(
            fire('enchanted_item', { item: { items: 'minecraft:diamond_sword' }, levels: { min: 30 } }, event).matched
        ).toBe(true);
        expect(fire('enchanted_item', { levels: { min: 31 } }, event).matched).toBe(false);
    });

    it('construct_beacon reads the pyramid level', () => {
        const event: TriggerEvents['construct_beacon'] = { player, level: 4 };

        expect(fire('construct_beacon', { level: 4 }, event).matched).toBe(true);
        expect(fire('construct_beacon', { level: { min: 5 } }, event).matched).toBe(false);
    });

    it('used_ender_eye reads the distance to the stronghold', () => {
        const event: TriggerEvents['used_ender_eye'] = { player, distance: 120.5 };

        expect(fire('used_ender_eye', { distance: { max: 200 } }, event).matched).toBe(true);
        expect(fire('used_ender_eye', { distance: { min: 200 } }, event).matched).toBe(false);
    });

    it('item_durability_changed reads the remaining durability and the delta', () => {
        const event: TriggerEvents['item_durability_changed'] = {
            player,
            item: stack('minecraft:elytra'),
            durability: 1,
            delta: 1
        };

        expect(
            fire('item_durability_changed', { item: { items: 'minecraft:elytra' }, durability: { max: 1 } }, event)
                .matched
        ).toBe(true);
        expect(fire('item_durability_changed', { durability: { min: 2 } }, event).matched).toBe(false);
    });

    it('spear_mobs reads the exact count', () => {
        const event: TriggerEvents['spear_mobs'] = { player, count: 5 };

        expect(fire('spear_mobs', { count: 5 }, event).matched).toBe(true);
        expect(fire('spear_mobs', { count: 4 }, event).matched).toBe(false);
    });

    it('levitation measures from where the effect started', () => {
        const event: TriggerEvents['levitation'] = {
            player: being('minecraft:player', { position: at(0, 114, 0) }),
            startPosition: at(0, 64, 0),
            duration: 200
        };

        expect(fire('levitation', { distance: { y: { min: 50 } } }, event).matched).toBe(true);
        expect(fire('levitation', { distance: { y: { min: 51 } } }, event).matched).toBe(false);
        expect(fire('levitation', { duration: { min: 300 } }, event).matched).toBe(false);
    });

    it.each(['nether_travel', 'fall_from_height', 'ride_entity_in_lava'] as const)(
        '%s measures the distance from the start position',
        (trigger) => {
            const event: TriggerEvents['nether_travel'] = {
                player: being('minecraft:player', { position: at(7000, 64, 0) }),
                startPosition: at(0, 64, 0)
            };

            expect(fire(trigger, { distance: { horizontal: { min: 7000 } } }, event).matched).toBe(true);
            expect(fire(trigger, { distance: { horizontal: { min: 7001 } } }, event).matched).toBe(false);
        }
    );

    it('fall_after_explosion also matches what caused the fall', () => {
        const event: TriggerEvents['fall_after_explosion'] = {
            player: being('minecraft:player', { position: at(0, 60, 0) }),
            startPosition: at(0, 64, 0),
            cause: being('minecraft:creeper')
        };

        expect(fire('fall_after_explosion', { cause: isType('minecraft:creeper') }, event).matched).toBe(true);
        expect(fire('fall_after_explosion', { cause: isType('minecraft:tnt') }, event).matched).toBe(false);
    });
});

describe('the remaining triggers', () => {
    it('changed_dimension matches the dimension on either side', () => {
        const event: TriggerEvents['changed_dimension'] = {
            player,
            from: 'minecraft:overworld',
            to: 'minecraft:the_nether'
        };

        expect(fire('changed_dimension', { to: 'minecraft:the_nether' }, event).matched).toBe(true);
        expect(fire('changed_dimension', { from: 'the_nether' }, event).matched).toBe(false);
        expect(fire('changed_dimension', { from: 'overworld', to: 'the_nether' }, event).matched).toBe(true);
    });

    it('effects_changed reads the effects on the player', () => {
        const event: TriggerEvents['effects_changed'] = {
            player: being('minecraft:player', {
                effects: new Map([
                    ['minecraft:conduit_power', { amplifier: 0, duration: 200, ambient: false, visible: true }]
                ])
            }),
            source: being('minecraft:arrow')
        };

        expect(fire('effects_changed', { effects: { 'minecraft:conduit_power': {} } }, event).matched).toBe(true);
        expect(fire('effects_changed', { effects: { 'minecraft:bad_omen': {} } }, event).matched).toBe(false);
        expect(fire('effects_changed', { source: isType('minecraft:arrow') }, event).matched).toBe(true);
    });

    it('fishing_rod_hooked matches the rod, the hooked entity and the catch', () => {
        const event: TriggerEvents['fishing_rod_hooked'] = {
            player,
            rod: stack('minecraft:fishing_rod'),
            entity: being('minecraft:item'),
            items: [stack('minecraft:pufferfish')]
        };

        expect(
            fire(
                'fishing_rod_hooked',
                { rod: { items: 'minecraft:fishing_rod' }, item: { items: 'minecraft:pufferfish' } },
                event
            ).matched
        ).toBe(true);
        expect(fire('fishing_rod_hooked', { item: { items: 'minecraft:salmon' } }, event).matched).toBe(false);
        expect(fire('fishing_rod_hooked', { entity: isType('minecraft:item') }, event).matched).toBe(true);
    });

    it('player_generates_container_loot matches the table', () => {
        const event: TriggerEvents['player_generates_container_loot'] = {
            player,
            lootTable: 'minecraft:chests/buried_treasure'
        };

        expect(
            fire('player_generates_container_loot', { loot_tables: 'minecraft:chests/buried_treasure' }, event).matched
        ).toBe(true);
        expect(
            fire('player_generates_container_loot', { loot_tables: 'minecraft:chests/igloo_chest' }, event).matched
        ).toBe(false);
    });

    it('brewed_potion reads the brewed stack through the potion component predicate', () => {
        const event: TriggerEvents['brewed_potion'] = { player, potion: stack('minecraft:potion') };

        expect(fire('brewed_potion', {}, event).matched).toBe(true);
    });
});
