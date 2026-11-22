import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import type { DataEntity } from './DataEntity';
import { EMPTY_SLOWDOWN } from './minecartTrack';
import { entityFixture, entityFixturePalette, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

const GROUND = FLOOR_Y + 1;
const RAILS = ['minecraft:rail', 'minecraft:golden_rail', 'minecraft:activator_rail'] as const;

const CART = {
    'minecraft:physics': {},
    'minecraft:rail_movement': {},
    'minecraft:collision_box': { width: 0.98, height: 0.7 },
    'minecraft:type_family': { family: ['minecart', 'inanimate'] }
};

/** The minecart, TNT minecart and hopper minecart's rail sensors, as the vanilla pack writes them. */
const CARTS = {
    'minecraft:minecart': {
        components: {
            ...CART,
            'minecraft:rail_sensor': { eject_on_activate: true },
            'minecraft:rideable': { seat_count: 1, seats: [{ position: [0, -0.2, 0] }] }
        }
    },
    'minecraft:tnt_minecart': {
        components: CART,
        component_groups: {
            'minecraft:inactive': {
                'minecraft:rail_sensor': {
                    on_activate: {
                        event: 'minecraft:on_prime',
                        filters: { all_of: [{ test: 'is_game_rule', domain: 'tntexplodes', value: true }] }
                    }
                }
            },
            'minecraft:primed_tnt': {
                'minecraft:explode': { fuse_length: 4, fuse_lit: true, power: 4 },
                'minecraft:rail_sensor': {}
            }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['minecraft:inactive'] } },
            'minecraft:on_prime': {
                add: { component_groups: ['minecraft:primed_tnt'] },
                remove: { component_groups: ['minecraft:inactive'] }
            }
        }
    },
    'minecraft:hopper_minecart': {
        components: CART,
        component_groups: {
            'minecraft:hopper_active': {
                'minecraft:rail_sensor': { on_activate: { event: 'minecraft:hopper_deactivate' } }
            },
            'minecraft:hopper_inactive': {
                'minecraft:rail_sensor': { on_deactivate: { event: 'minecraft:hopper_activate' } }
            }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['minecraft:hopper_active'] } },
            'minecraft:hopper_activate': {
                add: { component_groups: ['minecraft:hopper_active'] },
                remove: { component_groups: ['minecraft:hopper_inactive'] }
            },
            'minecraft:hopper_deactivate': {
                add: { component_groups: ['minecraft:hopper_inactive'] },
                remove: { component_groups: ['minecraft:hopper_active'] }
            }
        }
    },
    // The vanilla pack's command block minecart: both groups' sensors run its command on a
    // powered rail.
    'minecraft:command_block_minecart': {
        components: CART,
        component_groups: {
            'minecraft:command_block_active': {
                'minecraft:rail_sensor': {
                    on_deactivate: { event: 'minecraft:command_block_deactivate' },
                    eject_on_activate: false,
                    tick_command_block_on_activate: true
                }
            },
            'minecraft:command_block_inactive': {
                'minecraft:rail_sensor': {
                    on_activate: { event: 'minecraft:command_block_activate' },
                    eject_on_activate: false,
                    tick_command_block_on_activate: true
                }
            }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['minecraft:command_block_inactive'] } },
            'minecraft:command_block_activate': {
                add: { component_groups: ['minecraft:command_block_active'] },
                remove: { component_groups: ['minecraft:command_block_inactive'] }
            },
            'minecraft:command_block_deactivate': {
                add: { component_groups: ['minecraft:command_block_inactive'] },
                remove: { component_groups: ['minecraft:command_block_active'] }
            }
        }
    },
    'minecraft:pig': {
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:collision_box': { width: 0.9, height: 0.9 }
        }
    }
};

/** A runtime over a world with Bedrock's rails, which have no collision. */
const railWorld = (tntExplodes: boolean | undefined = true) => {
    const world = new TestEntityWorld(tntExplodes === undefined ? {} : { gameRules: { tntexplodes: tntExplodes } });
    const stack = entityFixtureStack(CARTS);
    const blocks = new Map(stack.blocks);
    for (const identifier of RAILS)
        blocks.set(
            identifier,
            definitionOf('blocks', identifier, {
                format_version: '1.26.20',
                'minecraft:block': {
                    description: { identifier },
                    components: { 'minecraft:collision_box': false, 'minecraft:light_dampening': 0 }
                }
            })
        );
    const railStates = (directions: number, powered: boolean) =>
        new BlockStateModel([
            {
                name: 'rail_direction',
                type: 'int',
                values: Array.from({ length: directions }, (_, direction) => direction),
                defaultValue: 0
            },
            ...(powered
                ? [{ name: 'rail_data_bit', type: 'bool' as const, values: [false, true], defaultValue: false }]
                : [])
        ]);
    const { runtime } = entityFixture(
        world,
        {
            load: () => ({ definitions: { ...stack, blocks }, diagnostics: [] }),
            blockPalette: new BlockPalette([
                ...entityFixturePalette().entries.map((entry) => [entry.identifier, entry.model] as const),
                ['minecraft:rail', railStates(10, false)],
                ['minecraft:golden_rail', railStates(6, true)],
                ['minecraft:activator_rail', railStates(6, true)]
            ])
        },
        CARTS
    );
    /** Lays a run of one rail block east to west under the cart's start. */
    const lay = (identifier: string, powered?: boolean): void => {
        for (let x = -2; x <= 30; x += 1)
            world.world.blocks.set(
                { x, y: GROUND, z: 0 },
                {
                    identifier,
                    states: { rail_direction: 1, ...(powered === undefined ? {} : { rail_data_bit: powered }) }
                },
                false
            );
    };
    const spawn = (identifier: string): DataEntity => {
        const cart = runtime.spawn(identifier, { x: 0.5, y: GROUND + 0.0625, z: 0.5 });
        if (cart === undefined) throw new Error(`the fixture declares no ${identifier}`);
        return cart;
    };
    return { runtime, lay, spawn, world };
};

describe('a minecart in the runtime', () => {
    it("runs along a rail it is pushed on, keeping Java's 0.96 of its speed a tick", () => {
        const { runtime, lay, spawn } = railWorld();
        lay('minecraft:rail');
        const cart = spawn('minecraft:minecart');
        cart.body.push({ x: 0.3, y: 0, z: 0 });
        runtime.tick(1);
        const first = cart.body.velocity.x;
        runtime.tick(2);

        expect(cart.body.velocity.x / first).toBeCloseTo(EMPTY_SLOWDOWN, 9);
        expect(cart.position.z).toBe(0.5);
        expect(cart.position.y).toBe(GROUND + 0.0625);
    });

    it('drops its rider over a powered activator rail and keeps it over an unpowered one', () => {
        for (const powered of [true, false]) {
            const { runtime, lay, spawn } = railWorld();
            lay('minecraft:activator_rail', powered);
            const cart = spawn('minecraft:minecart');
            const pig = runtime.spawn('minecraft:pig', cart.position);
            const seat = runtime.mobById(cart.id);
            if (pig === undefined || seat === undefined) throw new Error('the fixture declares no pig');
            runtime.mount(pig.body, seat);
            runtime.tick(1);

            expect(runtime.ridersOf(cart.body)).toHaveLength(powered ? 0 : 1);
        }
    });

    it('primes a TNT minecart over a powered activator rail, once', () => {
        const { runtime, lay, spawn } = railWorld();
        lay('minecraft:activator_rail', true);
        const cart = spawn('minecraft:tnt_minecart');
        const fired: string[] = [];
        const fire = cart.instance.fire.bind(cart.instance);
        cart.instance.fire = (event) => {
            fired.push(event);
            return fire(event);
        };
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        expect(fired.filter((event) => event === 'minecraft:on_prime')).toHaveLength(1);
        expect(cart.instance.hasComponent('minecraft:explode')).toBe(true);
    });

    it('primes a TNT minecart in a world that registered no tntexplodes rule, whose default is on', () => {
        const { runtime, lay, spawn } = railWorld(undefined);
        lay('minecraft:activator_rail', true);
        const cart = spawn('minecraft:tnt_minecart');
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        expect(cart.instance.hasComponent('minecraft:explode')).toBe(true);
    });

    it("leaves a TNT minecart unprimed when the world's tntexplodes rule is off, as the pack's filter asks", () => {
        const { runtime, lay, spawn } = railWorld(false);
        lay('minecraft:activator_rail', true);
        const cart = spawn('minecraft:tnt_minecart');
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        expect(cart.instance.hasComponent('minecraft:explode')).toBe(false);
    });

    it('locks a hopper minecart while the activator rail is powered and unlocks it once it is not', () => {
        const { runtime, lay, spawn } = railWorld();
        lay('minecraft:activator_rail', true);
        const cart = spawn('minecraft:hopper_minecart');
        runtime.tick(1);
        runtime.tick(2);
        const locked = cart.instance.componentParams('minecraft:rail_sensor');
        lay('minecraft:activator_rail', false);
        runtime.tick(3);
        runtime.tick(4);

        expect(locked).toEqual({ on_deactivate: { event: 'minecraft:hopper_activate' } });
        expect(cart.instance.componentParams('minecraft:rail_sensor')).toEqual({
            on_activate: { event: 'minecraft:hopper_deactivate' }
        });
    });
});

describe('a command block minecart', () => {
    it('runs its command over a powered activator rail once every four ticks, as the cart and its name', () => {
        const { runtime, lay, spawn, world } = railWorld();
        lay('minecraft:activator_rail', true);
        const cart = spawn('minecraft:command_block_minecart');
        expect(
            runtime.setMinecartCommand(cart.id, { command: 'say ride', customName: 'Cart', trackOutput: true })
        ).toBe(true);

        // Runs on ticks 1, 5 and 9, so the count after each tick climbs only on those.
        const counts: number[] = [];
        for (let tick = 1; tick <= 9; tick += 1) {
            world.advance();
            runtime.tick(tick);
            counts.push(world.commands.length);
        }

        expect(counts).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3]);
        expect(world.commands[0]).toMatchObject({ command: 'say ride', name: 'Cart', entityId: cart.id });
    });

    it('runs nothing over an unpowered rail, or without a command', () => {
        for (const [powered, command] of [
            [false, 'say ride'],
            [true, '']
        ] as const) {
            const { runtime, lay, spawn, world } = railWorld();
            lay('minecraft:activator_rail', powered);
            const cart = spawn('minecraft:command_block_minecart');
            runtime.setMinecartCommand(cart.id, { command, customName: '', trackOutput: true });
            for (let tick = 1; tick <= 5; tick += 1) runtime.tick(tick);

            expect(world.commands).toEqual([]);
        }
    });

    it('refuses a command for anything but a command block minecart', () => {
        const { runtime, spawn } = railWorld();
        const cart = spawn('minecraft:minecart');

        expect(runtime.setMinecartCommand(cart.id, { command: 'say no', customName: '', trackOutput: true })).toBe(
            false
        );
    });
});
