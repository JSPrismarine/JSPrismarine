/**
 * The server's `CommandHost`, exercised through the real command trees.
 *
 * Dispatched rather than called directly: the thing worth testing is that a
 * line a player types changes the world, and a verb asserted on its own would
 * pass even if nothing routed a command to it.
 */
import { createCommandSource } from '@jsprismarine/commands';
import type { CommandSource } from '@jsprismarine/commands';
import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Player from '../../Player';
import type { Server } from '../../';
import type { Config } from '../../config/Config';
import { Entity } from '../../entity/Entity';
import type { ItemManager } from '../../item/ItemManager';
import type { Item } from '../../item/Item';
import Inventory from '../../inventory/Inventory';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { Dimensions } from '../../world/Dimension';
import type GameRuleManager from '../../world/GameRuleManager';
import type { GameRuleEntry } from '../../world/GameRuleManager';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { collectAsyncCommands } from '../Command';
import { buildVanillaCommands } from '../vanillaCommands';
import { serverCommandHost } from './serverCommandHost';

/** One block position's contents, keyed as `x,y,z`. */
type BlockTable = Map<string, { name: string; states: Record<string, string | number | boolean> }>;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

interface Fixture {
    readonly server: Server;
    readonly world: World;
    readonly blocks: BlockTable;
    readonly rules: Map<string, GameRuleEntry>;
    readonly entities: Entity[];
    readonly players: Player[];
    readonly sent: unknown[];
    readonly feedback: string[];
    readonly errors: string[];
    /** Runs one command line as the console and answers what it returned. */
    run(line: string, as?: Player): Promise<number>;
}

const buildFixture = (): Fixture => {
    const blocks: BlockTable = new Map();
    const rules = new Map<string, GameRuleEntry>([
        ['sendCommandFeedback', [true, true]],
        ['fallDamage', [true, true]],
        ['randomTickSpeed', [3, true]]
    ]);
    const entities: Entity[] = [];
    const players: Player[] = [];
    const sent: unknown[] = [];
    const feedback: string[] = [];
    const errors: string[] = [];

    const gameRules = stub<GameRuleManager>({
        getGameRule: (name: string) => rules.get(name) ?? null,
        setGameRule: (name: string, value: boolean | number, editable: boolean) => {
            rules.set(name, [value, editable]);
        }
    });

    const world = stub<World>({
        getDimension: () => Dimensions.Overworld,
        getGameRuleManager: () => gameRules,
        getEntities: () => entities,
        getPlayers: () => players,
        getTicks: () => ticks,
        setTicks: (value: number) => {
            ticks = value;
        },
        sendTime: async () => {},
        addEntity: async (entity: Entity) => {
            entities.push(entity);
        },
        removeEntity: async (entity: Entity) => {
            entities.splice(entities.indexOf(entity), 1);
        },
        breakBlock: async (position: Vector3) => {
            blocks.set(key(position.getX(), position.getY(), position.getZ()), {
                name: 'minecraft:air',
                states: {}
            });
            return true;
        },
        setSpawnPosition: vi.fn(),
        saveLevelData: async () => {},
        loadedBlockAt: (x: number, y: number, z: number) =>
            blocks.get(key(x, y, z)) ?? { name: 'minecraft:air', states: {} },
        setLoadedBlockState: (x: number, y: number, z: number, block: { name: string; states: object }) => {
            const existing = blocks.get(key(x, y, z));
            if (existing?.name === block.name) return false;
            blocks.set(key(x, y, z), { name: block.name, states: { ...block.states } });
            return true;
        },
        getLoadedChunk: () => null,
        // Late-bound: an entity class reads the server off the world it is
        // built in, and the server double is built from this one.
        getServer: () => server
    });
    let ticks = 0;

    const server = stub<Server>({
        getLogger: () => stub({ debug: () => {}, verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getWorldManager: () => stub<WorldManager>({ getDefaultWorld: () => world, getWorlds: () => [world] }),
        getSessionManager: () => stub({ getAllPlayers: () => players }),
        getPermissionManager: () =>
            stub<PermissionManager>({
                isOp: () => false,
                setOp: async () => true,
                can: () => ({ execute: () => true })
            }),
        getItemManager: () =>
            stub<ItemManager>({
                getItem: (name: string) =>
                    name === 'minecraft:stone'
                        ? stub<Item>({ getName: () => name, getMaxAmount: () => 64, meta: 0 })
                        : null
            }),
        getRandom: () => () => 0.5,
        getConfig: () => stub<Config>({ getGamemode: () => 'survival' }),
        broadcastPacket: async (packet: unknown) => {
            sent.push(packet);
        }
    });

    const registry = buildVanillaCommands();
    const host = serverCommandHost(server);

    const sourceFor = (as?: Player): CommandSource =>
        createCommandSource({
            host,
            ...(as === undefined ? {} : { entity: refOf(as) }),
            permissionLevel: 5,
            onFeedback: (message) => feedback.push(message),
            onError: (message) => errors.push(message)
        });

    const refOf = (player: Player) => ({
        id: player.getRuntimeId().toString(),
        type: 'minecraft:player',
        name: player.getName(),
        isPlayer: true,
        position: {
            x: player.getPosition().getX(),
            y: player.getPosition().getY(),
            z: player.getPosition().getZ()
        },
        rotation: { yaw: player.yaw, pitch: player.pitch },
        dimension: 'minecraft:overworld'
    });

    return {
        server,
        world,
        blocks,
        rules,
        entities,
        players,
        sent,
        feedback,
        errors,
        run: async (line, as) => {
            let results: unknown = [];
            const started = collectAsyncCommands(() => {
                results = registry.getDispatcher().execute(line, sourceFor(as));
            });
            await Promise.all(started);
            return Array.isArray(results)
                ? results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
                : 0;
        }
    };
};

/** A living entity double that answers everything `entityRefOf` reads. */
const mobAt = (fixture: Fixture, id: bigint, type: string, position: Vector3): Entity => {
    const entity = stubOf(Entity, {
        getRuntimeId: () => id,
        getType: () => type,
        getName: () => type.split(':')[1]!,
        getPosition: () => Position.fromVector3(position, fixture.world),
        getWorld: () => fixture.world,
        isAlive: () => true,
        setHealth: vi.fn().mockResolvedValue(undefined),
        damage: vi.fn().mockResolvedValue(true),
        setPosition: vi.fn().mockResolvedValue(undefined),
        yaw: 0,
        pitch: 0,
        headYaw: 0
    });
    // The tag set is real state on `Entity`, so the double borrows the real
    // methods rather than restating them.
    Object.defineProperty(entity, 'tags', { value: new Set<string>(), writable: false });
    fixture.entities.push(entity);
    return entity;
};

const playerAt = (fixture: Fixture, id: bigint, name: string, position: Vector3): Player => {
    const inventory = new Inventory(36);
    const player = stubOf(Player, {
        getRuntimeId: () => id,
        getType: () => 'minecraft:player',
        getName: () => name,
        getPosition: () => Position.fromVector3(position, fixture.world),
        getWorld: () => fixture.world,
        isAlive: () => true,
        gamemode: Gametype.SURVIVAL,
        setGamemode: vi.fn().mockResolvedValue(undefined),
        setPosition: vi.fn().mockResolvedValue(undefined),
        kick: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getInventory: () => inventory,
        getNetworkSession: () => stub({ send: async () => {}, sendInventory: async () => {} }),
        yaw: 0,
        pitch: 0,
        headYaw: 0
    });
    Object.defineProperty(player, 'tags', { value: new Set<string>(), writable: false });
    fixture.entities.push(player);
    fixture.players.push(player);
    return player;
};

describe('the server command host', () => {
    let fixture: Fixture;

    beforeEach(() => {
        fixture = buildFixture();
    });

    describe('blocks', () => {
        it('places one block and reports it', async () => {
            await expect(fixture.run('setblock 1 2 3 minecraft:stone')).resolves.toBe(1);

            expect(fixture.blocks.get(key(1, 2, 3))?.name).toBe('minecraft:stone');
        });

        it('reads block states off a Bedrock state list', async () => {
            await fixture.run('setblock 0 0 0 minecraft:oak_stairs ["weirdo_direction"=2]');

            expect(fixture.blocks.get(key(0, 0, 0))?.states).toEqual({ weirdo_direction: '2' });
        });

        it('keeps what is already there in keep mode', async () => {
            await fixture.run('setblock 4 4 4 minecraft:stone');
            await expect(fixture.run('setblock 4 4 4 minecraft:dirt keep')).resolves.toBe(0);

            expect(fixture.blocks.get(key(4, 4, 4))?.name).toBe('minecraft:stone');
        });

        it('fills a region and counts the blocks it changed', async () => {
            await expect(fixture.run('fill 0 0 0 1 1 1 minecraft:stone')).resolves.toBe(8);

            expect(fixture.blocks.size).toBe(8);
        });

        it('leaves the inside alone for an outline fill', async () => {
            await fixture.run('fill 0 0 0 2 2 2 minecraft:stone outline');

            // 27 blocks, less the one in the middle.
            expect(fixture.blocks.size).toBe(26);
            expect(fixture.blocks.has(key(1, 1, 1))).toBe(false);
        });

        it('clones a region to a new place', async () => {
            await fixture.run('fill 0 0 0 1 0 1 minecraft:stone');
            await expect(fixture.run('clone 0 0 0 1 0 1 10 0 10')).resolves.toBe(4);

            expect(fixture.blocks.get(key(10, 0, 10))?.name).toBe('minecraft:stone');
            expect(fixture.blocks.get(key(11, 0, 11))?.name).toBe('minecraft:stone');
        });

        it('refuses a region bigger than the block-modification limit', async () => {
            await expect(fixture.run('fill 0 0 0 100 100 100 minecraft:stone')).rejects.toThrow('32768');
        });
    });

    describe('entities', () => {
        it('selects by type through the world', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(1, 0, 0));
            mobAt(fixture, 2n, 'minecraft:cow', new Vector3(2, 0, 0));

            await expect(fixture.run('kill @e[type=pig]')).resolves.toBe(1);
        });

        it('kills a living entity by taking its health', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await fixture.run('kill @e');

            expect(pig.setHealth).toHaveBeenCalledWith(0, expect.anything());
        });

        it('removes an entity that has no health to take', async () => {
            const item = stubOf(Entity, {
                getRuntimeId: () => 7n,
                getType: () => 'minecraft:item',
                getName: () => 'Item',
                getPosition: () => Position.fromVector3(new Vector3(0, 0, 0), fixture.world),
                getWorld: () => fixture.world,
                isAlive: () => false,
                yaw: 0,
                pitch: 0
            });
            fixture.entities.push(item);

            await expect(fixture.run('kill @e')).resolves.toBe(1);
            // By identity rather than `toContain`: letting vitest pretty-print
            // a prototype-only entity walks into `toString()`, which reaches
            // for metadata the double has never been given.
            expect(fixture.entities.includes(item)).toBe(false);
        });

        it('teleports a player to a position', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('tp @a 10 70 10')).resolves.toBe(1);
            expect(player.setPosition).toHaveBeenCalledWith(
                expect.objectContaining({ position: expect.objectContaining({ x: 10, y: 70, z: 10 }) })
            );
        });

        it('changes a game mode', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('gamemode creative @a')).resolves.toBe(1);
            expect(player.setGamemode).toHaveBeenCalledWith(Gametype.CREATIVE);
        });

        it('gives an item and counts what fitted', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('give @a minecraft:stone 5')).resolves.toBe(5);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(5);
        });

        it('gives nothing for an item this server does not have', async () => {
            // A real Bedrock item id, so the argument parses; the item manager is what has
            // no such item, which is the case the count has to report as zero.
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('give @a minecraft:diamond')).resolves.toBe(0);
        });

        it('refuses an item id Bedrock does not publish', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('give @a minecraft:not_a_thing')).rejects.toThrow('minecraft:item');
        });

        it('clears items back out of an inventory', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('give @a minecraft:stone 5');

            await expect(fixture.run('clear @a minecraft:stone 3')).resolves.toBe(3);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(2);
        });

        it('adds, lists and removes a tag', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await expect(fixture.run('tag @e add winner')).resolves.toBe(1);
            expect(pig.getTags()).toEqual(['winner']);

            await expect(fixture.run('tag @e add winner')).resolves.toBe(0);
            await expect(fixture.run('tag @e remove winner')).resolves.toBe(1);
            expect(pig.getTags()).toEqual([]);
        });

        it('selects by a tag it was given', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));
            const cow = mobAt(fixture, 2n, 'minecraft:cow', new Vector3(0, 0, 0));
            await fixture.run('tag @e[type=cow] add keep');

            await expect(fixture.run('kill @e[tag=keep]')).resolves.toBe(1);
            expect(cow.setHealth).toHaveBeenCalled();
        });

        it('summons an entity into the world', async () => {
            await expect(fixture.run('summon minecraft:pig 5 6 7')).resolves.toBe(1);

            const summoned = fixture.entities.at(-1);
            expect(summoned?.getType()).toBe('minecraft:pig');
            expect(summoned?.getPosition().getX()).toBe(5);
        });

        it('summons nothing for a type no class answers to', async () => {
            // `minecraft:allay` is in Mojang's own `EntityType` enum and this server has no
            // class for it, so the line parses and the summon reports that it did nothing.
            await expect(fixture.run('summon minecraft:allay')).resolves.toBe(0);
            expect(fixture.entities).toHaveLength(0);
        });

        it('damages an entity', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await expect(fixture.run('damage @e 4')).resolves.toBe(1);
            expect(pig.damage).toHaveBeenCalledWith(4, expect.anything());
        });
    });

    describe('the world', () => {
        it('sets and queries the time', async () => {
            await expect(fixture.run('time set 6000')).resolves.toBe(6000);
            await expect(fixture.run('time query daytime')).resolves.toBe(6000);
        });

        it('adds to the time', async () => {
            await fixture.run('time set 100');

            await expect(fixture.run('time add 50')).resolves.toBe(150);
        });

        it('reads a gamerule under the name the world stores it by', async () => {
            // The command layer speaks 1.21.11's `minecraft:fall_damage` and
            // the world stores the client's `fallDamage`.
            await fixture.run('gamerule fall_damage');

            expect(fixture.feedback).toContain('minecraft:fall_damage = true');
        });

        it('writes a gamerule', async () => {
            await expect(fixture.run('gamerule fall_damage false')).resolves.toBe(1);

            expect(fixture.rules.get('fallDamage')?.[0]).toBe(false);
        });

        it('writes an integer gamerule', async () => {
            await expect(fixture.run('gamerule random_tick_speed 9')).resolves.toBe(1);

            expect(fixture.rules.get('randomTickSpeed')?.[0]).toBe(9);
        });

        it('refuses a gamerule this server does not keep', async () => {
            await expect(fixture.run('gamerule locator_bar true')).resolves.toBe(0);
        });

        it('moves the world spawn', async () => {
            await expect(fixture.run('setworldspawn 8 65 8')).resolves.toBe(1);

            expect(fixture.world.setSpawnPosition).toHaveBeenCalled();
            expect(fixture.sent).toHaveLength(1);
        });
    });

    describe('what has no subsystem behind it', () => {
        it('refuses a weather change rather than reporting one', async () => {
            // `/weather` is not registered, so this reaches the host only
            // through a direct call - which is what `execute` would do.
            expect(() => serverCommandHost(fixture.server).world.setWeather('rain')).toThrow('weather');
        });

        it('refuses a score read', () => {
            expect(() => serverCommandHost(fixture.server).scoreboard.getScore('Steve', 'kills')).toThrow('scoreboard');
        });

        it('refuses an NBT read', () => {
            expect(() => serverCommandHost(fixture.server).data.getData({ kind: 'storage', id: 'test' })).toThrow(
                'NBT'
            );
        });

        it('fails the condition rather than running the body of `execute if score`', async () => {
            // The refusal does not reach the player here, and that is Java's
            // own rule rather than this server's: `execute if` is a fork, and
            // `CommandDispatcher.execute` swallows a fork's exception and
            // answers 0. What matters is that the body does not run.
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('execute if score @a kills matches 1.. run say hi')).resolves.toBe(0);
            expect(player.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('execute', () => {
        it('runs the chain once per matched entity', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(1, 0, 0));
            mobAt(fixture, 2n, 'minecraft:pig', new Vector3(2, 0, 0));

            // One `/setblock` per pig, each at the pig's own position.
            await fixture.run('execute as @e[type=pig] at @s run setblock ~ ~ ~ minecraft:stone');

            expect(fixture.blocks.get(key(1, 0, 0))?.name).toBe('minecraft:stone');
            expect(fixture.blocks.get(key(2, 0, 0))?.name).toBe('minecraft:stone');
        });

        it('returns 0 rather than throwing when a fork matches nothing', async () => {
            await expect(fixture.run('execute as @e[type=pig] run say hi')).resolves.toBe(0);
        });

        it('tests a block through the host', async () => {
            await fixture.run('setblock 0 0 0 minecraft:stone');

            await expect(fixture.run('execute if block 0 0 0 minecraft:stone run time set 1')).resolves.toBe(1);
            await expect(fixture.run('execute if block 0 0 0 minecraft:dirt run time set 2')).resolves.toBe(0);
        });
    });
});
