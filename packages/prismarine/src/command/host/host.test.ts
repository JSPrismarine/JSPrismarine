/**
 * The server's `CommandHost`, exercised through the real command trees.
 *
 * Dispatched rather than called directly: the thing worth testing is that a
 * line a player types changes the world, and a verb asserted on its own would
 * pass even if nothing routed a command to it.
 */
import { createCommandSource } from '@jsprismarine/commands';
import type { CommandSource } from '@jsprismarine/commands';
import type { BlockType } from '@jsprismarine/blocks';
import { Gametype, TitleType } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Player from '../../Player';
import type { Server } from '../../';
import type { Config } from '../../config/Config';
import { definitionsOf, definitionOf } from '../../content/ContentOptions';
import type { ServerContent } from '../../content/ServerContent';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Entity } from '../../entity/Entity';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item as ItemStack } from '../../item/Item';
import { vanillaItemTypes } from '../../item/vanillaItemTypes';
import AnimateEntityPacket from '../../network/packet/AnimateEntityPacket';
import CameraShakePacket, { CameraShakeAction, CameraShakeType } from '../../network/packet/CameraShakePacket';
import PlayerFogPacket from '@jsprismarine/protocol/packet/PlayerFogPacket';
import UnlockedRecipesPacket, { UnlockedRecipesType } from '../../network/packet/UnlockedRecipesPacket';
import SetTitlePacket from '../../network/packet/SetTitlePacket';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { LootRegistry, javaLootTables } from '@jsprismarine/loot';
import { loadRecipes } from '@jsprismarine/recipes';
import { RemoveObjectivePacket, SetDisplayObjectivePacket, SetScorePacket } from '@jsprismarine/protocol';
import { Dimensions } from '../../world/Dimension';
import type GameRuleManager from '../../world/GameRuleManager';
import type { GameRuleEntry } from '../../world/GameRuleManager';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { inertEntityRuntime, testContent } from '../../testing/entityServer';
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
    /** Everything `World.dropContents` was asked to put on the ground. */
    readonly dropped: { position: Vector3; contents: unknown[] }[];
    /** Puts a content build behind the server, which is what `/loot` reads. */
    useContent(built: ServerContent): void;
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
    const dropped: { position: Vector3; contents: unknown[] }[] = [];
    let weather: 'clear' | 'rain' | 'thunder' = 'clear';
    const sent: unknown[] = [];
    const feedback: string[] = [];
    const errors: string[] = [];

    // Case-insensitive, as the real manager is: the command layer writes
    // Java's `doDaylightCycle` and the client's own spelling is
    // `doDayLightCycle`, and both have to find the one rule.
    const keyFor = (name: string) => [...rules.keys()].find((key) => key.toLowerCase() === name.toLowerCase()) ?? name;
    const gameRules = stub<GameRuleManager>({
        getGameRule: (name: string) => rules.get(keyFor(name)) ?? null,
        setGameRule: (name: string, value: boolean | number, editable: boolean) => {
            rules.set(keyFor(name), [value, editable]);
        }
    });

    // Annotated, because `world` and `server` name each other: without a declared type
    // TypeScript would have to infer one from the other and gives up.
    const world: World = stub<World>({
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
        getWeather: () => weather,
        setWeather: vi.fn((kind: 'clear' | 'rain' | 'thunder') => {
            weather = kind;
        }),
        dropContents: async (position: Vector3, contents: unknown[]) => {
            dropped.push({ position, contents });
        },
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
        getSeed: () => 1n,
        // Inert, which declares no entity types for `/summon` to build.
        dataEntities: () => inertEntityRuntime(),
        // Late-bound: an entity class reads the server off the world it is
        // built in, and the server double is built from this one.
        getServer: () => server
    });
    let ticks = 0;

    const server: Server = stub<Server>({
        getLogger: () => stub({ debug: () => {}, verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getWorldManager: () => stub<WorldManager>({ getDefaultWorld: () => world, getWorlds: () => [world] }),
        getSessionManager: () => stub({ getAllPlayers: () => players }),
        getPermissionManager: () =>
            stub<PermissionManager>({
                isOp: () => false,
                setOp: async () => true,
                can: () => ({ execute: () => true, not: () => ({ execute: () => false }) })
            }),
        getRandom: () => () => 0.5,
        getWorldReplicators: () =>
            stub({
                for: () =>
                    stub({
                        send: (packet: unknown) => {
                            sent.push(packet);
                        },
                        sendAround: (_at: unknown, packet: unknown) => {
                            sent.push(packet);
                        }
                    })
            }),
        getConfig: () => stub<Config>({ getGamemode: () => 'survival' }),
        // The two-block fixture until `useContent` hands over a build with
        // the loot tables or recipes the test is about.
        getContent: () => content ?? testContent(),
        broadcastPacket: async (packet: unknown) => {
            sent.push(packet);
        }
    });

    let content: ServerContent | undefined;

    // Include these names in the command parser so the host can refuse them when its
    // data-driven runtime does not declare them.
    const registry = buildVanillaCommands({ entityTypes: ['minecraft:tnt', 'minecraft:allay'] });
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
        dropped,
        useContent: (built) => {
            content = built;
        },
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
        getFeetY: () => position.getY(),
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
    const inventory = new HumanInventory();
    const player = stubOf(Player, {
        getRuntimeId: () => id,
        getType: () => 'minecraft:player',
        getName: () => name,
        getPosition: () => Position.fromVector3(position, fixture.world),
        getFeetY: () => position.getY(),
        getWorld: () => fixture.world,
        isAlive: () => true,
        gamemode: Gametype.SURVIVAL,
        setGamemode: vi.fn().mockResolvedValue(undefined),
        setPosition: vi.fn().mockResolvedValue(undefined),
        kick: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getInventory: () => inventory,
        attributes: new Attributes(Attributes.getPlayerDefaults()),
        getNetworkSession: () =>
            stub({
                send: async (packet: unknown) => {
                    fixture.sent.push(packet);
                },
                sendInventory: async () => {},
                sendAttributes: async () => {}
            }),
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
                getFeetY: () => 0,
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

        it('refuses a type the data-driven runtime does not declare', async () => {
            await expect(fixture.run('summon minecraft:tnt 5 6 7')).resolves.toBe(0);
            expect(fixture.entities).toHaveLength(0);
        });

        it('summons nothing for a type with neither a class nor a declared type', async () => {
            // `minecraft:allay` is in Mojang's own `EntityType` enum, and this fixture has no
            // runtime behind it, so the line parses and the summon reports that it did nothing.
            // The identifier rename and the data path are covered in `data/live.test.ts`.
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

    describe('the weather', () => {
        it('sets what it is asked for and reads it back', () => {
            const host = serverCommandHost(fixture.server).world;

            host.setWeather('rain');

            expect(fixture.world.setWeather).toHaveBeenCalledWith('rain', undefined);
            expect(host.getWeather()).toBe('rain');
        });

        it('passes a duration through when one is given', () => {
            serverCommandHost(fixture.server).world.setWeather('thunder', 600);

            expect(fixture.world.setWeather).toHaveBeenCalledWith('thunder', 600);
        });
    });

    describe('what has no subsystem behind it', () => {
        it('refuses an NBT read', () => {
            expect(() => serverCommandHost(fixture.server).data.getData({ kind: 'storage', id: 'test' })).toThrow(
                'NBT'
            );
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

    describe('the Bedrock-only commands', () => {
        it('counts entities through /testfor', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));
            mobAt(fixture, 2n, 'minecraft:pig', new Vector3(1, 0, 0));
            mobAt(fixture, 3n, 'minecraft:cow', new Vector3(2, 0, 0));

            await expect(fixture.run('testfor @e[type=pig]')).resolves.toBe(2);
        });

        it('matches a block through /testforblock', async () => {
            await fixture.run('setblock 3 3 3 minecraft:stone');

            await expect(fixture.run('testforblock 3 3 3 minecraft:stone')).resolves.toBe(1);
            await expect(fixture.run('testforblock 3 3 3 minecraft:dirt')).resolves.toBe(0);
        });

        it('compares two regions through /testforblocks', async () => {
            await fixture.run('fill 0 0 0 1 0 1 minecraft:stone');
            await fixture.run('fill 10 0 10 11 0 11 minecraft:stone');

            await expect(fixture.run('testforblocks 0 0 0 1 0 1 10 0 10')).resolves.toBe(4);
        });

        it('locks the day through /daylock by turning the cycle off', async () => {
            fixture.rules.set('doDayLightCycle', [true, true]);

            await expect(fixture.run('daylock')).resolves.toBe(1);
            expect(fixture.rules.get('doDayLightCycle')?.[0]).toBe(false);

            await fixture.run('daylock false');
            expect(fixture.rules.get('doDayLightCycle')?.[0]).toBe(true);
        });

        it('sends a rawtext title through /titleraw', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('titleraw @a title {"rawtext":[{"text":"hi"}]}')).resolves.toBe(1);

            const [packet] = fixture.sent;
            expect(packet).toBeInstanceOf(SetTitlePacket);
            if (!(packet instanceof SetTitlePacket)) return;
            expect(packet.titleType).toBe(TitleType.TITLE_TEXT_OBJECT);
            expect(packet.titleText).toBe('{"rawtext":[{"text":"hi"}]}');
        });

        it('sends a plain title through /title and the timings through its times form', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('title @a title hello');
            await fixture.run('title @a times 5 100 5');

            const titles = fixture.sent.filter((packet) => packet instanceof SetTitlePacket);
            expect(titles[0]?.titleType).toBe(TitleType.TITLE);
            expect(titles[1]?.titleType).toBe(TitleType.TIMES);
            expect(titles[1]?.stayTime).toBe(100);
        });

        it('writes a hotbar slot through /replaceitem', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('replaceitem entity @a slot.hotbar 2 minecraft:stone 4')).resolves.toBe(4);
            expect(player.getInventory().getEntry(2)?.getItem().getName()).toBe('minecraft:stone');
            expect(player.getInventory().getEntry(2)?.getCount()).toBe(4);
        });

        it('leaves an occupied slot alone in keep mode', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('replaceitem entity @a slot.hotbar 0 minecraft:stone 1');

            await expect(fixture.run('replaceitem entity @a slot.hotbar 0 keep minecraft:stone 9')).resolves.toBe(0);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(1);
        });

        it('writes the ender chest, which is a container a player carries', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('replaceitem entity @a slot.enderchest 3 minecraft:stone 2')).resolves.toBe(2);
            expect(player.getInventory().getEnderChest().getEntry(3)?.getItem().getName()).toBe('minecraft:stone');
        });

        it('reads the indexed armor spelling as the named one', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('replaceitem entity @a slot.armor 1 minecraft:stone 1')).resolves.toBe(1);
            await expect(fixture.run('replaceitem entity @a slot.armor.legs 0 minecraft:stone 2')).resolves.toBe(2);

            // Index 1 is the chestplate and `slot.armor.legs` is index 2, so
            // the two spellings addressed different slots of one container.
            expect(player.getInventory().getArmor().getEntry(1)?.getCount()).toBe(1);
            expect(player.getInventory().getArmor().getEntry(2)?.getCount()).toBe(2);
        });

        it('refuses a slot group this server has no container for', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            // A saddle is a slot Bedrock names and no entity here holds, so a
            // write would land nowhere.
            await expect(fixture.run('replaceitem entity @a slot.saddle 0 minecraft:stone')).rejects.toThrow(
                'slot.saddle'
            );
        });

        it('shakes a camera through /camerashake', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('camerashake add @a 0.5 3 rotational')).resolves.toBe(1);

            const [packet] = fixture.sent;
            expect(packet).toBeInstanceOf(CameraShakePacket);
            if (!(packet instanceof CameraShakePacket)) return;
            expect(packet.intensity).toBe(0.5);
            expect(packet.seconds).toBe(3);
            expect(packet.shakeType).toBe(CameraShakeType.Rotational);
            expect(packet.shakeAction).toBe(CameraShakeAction.Add);
        });

        it('keeps the fog stack the client cannot be asked for', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('fog @a push minecraft:fog_ocean first');
            await fixture.run('fog @a push minecraft:fog_hell second');
            const pushed = fixture.sent.filter((packet) => packet instanceof PlayerFogPacket);
            expect(pushed.at(-1)?.getPacketData()?.fogStack).toEqual(['minecraft:fog_ocean', 'minecraft:fog_hell']);

            await expect(fixture.run('fog @a pop first')).resolves.toBe(1);
            const popped = fixture.sent.filter((packet) => packet instanceof PlayerFogPacket);
            expect(popped.at(-1)?.getPacketData()?.fogStack).toEqual(['minecraft:fog_hell']);
        });

        it('changes nothing when /fog pops a layer nobody pushed', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('fog @a pop nothing')).resolves.toBe(0);
            expect(fixture.sent.filter((packet) => packet instanceof PlayerFogPacket)).toHaveLength(0);
        });

        it('names every animated actor in one packet through /playanimation', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));
            mobAt(fixture, 2n, 'minecraft:pig', new Vector3(1, 0, 0));

            await expect(fixture.run('playanimation @e animation.pig.baby_transform')).resolves.toBe(2);

            const [packet] = fixture.sent;
            expect(packet).toBeInstanceOf(AnimateEntityPacket);
            if (!(packet instanceof AnimateEntityPacket)) return;
            expect(packet.animation).toBe('animation.pig.baby_transform');
            expect(packet.runtimeIds).toEqual([1n, 2n]);
        });
    });

    describe('the scoreboard', () => {
        it('tracks a score through add, get and reset', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('scoreboard objectives add kills dummy Kills')).resolves.toBe(1);
            await expect(fixture.run('scoreboard players set Steve kills 3')).resolves.toBe(3);
            await expect(fixture.run('scoreboard players add Steve kills 4')).resolves.toBe(7);
            await expect(fixture.run('scoreboard players get @s kills', fixture.players[0])).resolves.toBe(7);

            await expect(fixture.run('scoreboard players reset Steve kills')).resolves.toBe(1);
            await fixture.run('scoreboard players get Steve kills');
            expect(fixture.errors.at(-1)).toContain('no such score');
        });

        it('refuses a second objective of the same name, as Java does', async () => {
            await expect(fixture.run('scoreboard objectives add kills dummy')).resolves.toBe(1);
            await expect(fixture.run('scoreboard objectives add kills dummy')).resolves.toBe(0);
        });

        it('names the objective nobody created rather than failing quietly', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('scoreboard players set @a nothing 1')).rejects.toThrow(
                /no scoreboard objective called nothing/
            );
        });

        describe('reading a score of an objective nobody created', () => {
            it('names the objective instead of answering', () => {
                // Each call builds its own board, so this one is as empty as
                // a server where nobody ran `/scoreboard objectives add`.
                expect(() => serverCommandHost(fixture.server).scoreboard.getScore('Steve', 'kills')).toThrow(
                    'There is no scoreboard objective called kills'
                );
            });

            it('answers the same read once the objective exists', async () => {
                // The verb is implemented; the refusal above is about the
                // objective, not about a missing subsystem.
                await fixture.run('scoreboard objectives add kills dummy');
                await fixture.run('scoreboard players set Steve kills 3');
                await fixture.run('scoreboard players get Steve kills');

                expect(fixture.feedback.at(-1)).toContain('Steve has 3');
            });

            it('fails an `execute if score` condition without telling the player why', async () => {
                // Java's own rule rather than this server's: `execute if` is
                // a fork, and `CommandDispatcher.execute` swallows a fork's
                // exception and answers 0. What matters is that the body does
                // not run and nothing reaches the player.
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

                await expect(fixture.run('execute if score @a kills matches 1.. run say hi')).resolves.toBe(0);
                expect(player.sendMessage).not.toHaveBeenCalled();
                expect(fixture.errors).toEqual([]);
            });

            it('runs the same condition once the objective exists', async () => {
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                await fixture.run('scoreboard objectives add kills dummy');
                await fixture.run('scoreboard players set Steve kills 3');

                await expect(fixture.run('execute if score @a kills matches 1.. run say hi')).resolves.toBe(1);
                expect(player.sendMessage).toHaveBeenCalled();
            });
        });

        it('applies every operation Java defines', async () => {
            await fixture.run('scoreboard objectives add a dummy');
            await fixture.run('scoreboard players set left a 7');
            await fixture.run('scoreboard players set right a 2');

            await expect(fixture.run('scoreboard players operation left a %= right a')).resolves.toBe(1);
            await fixture.run('scoreboard players set left a 7');
            await expect(fixture.run('scoreboard players operation left a *= right a')).resolves.toBe(14);
            await expect(fixture.run('scoreboard players operation left a >< right a')).resolves.toBe(2);
            await fixture.run('scoreboard players get right a');
            expect(fixture.feedback.at(-1)).toContain('right has 14');
        });

        it('leaves the target alone when a division has nothing to divide by', async () => {
            await fixture.run('scoreboard objectives add a dummy');
            await fixture.run('scoreboard players set left a 7');
            await fixture.run('scoreboard players set right a 0');

            await expect(fixture.run('scoreboard players operation left a /= right a')).resolves.toBe(0);
            await fixture.run('scoreboard players get left a');
            expect(fixture.feedback.at(-1)).toContain('left has 7');
        });

        it('draws a slot and tells the clients about every line in it', async () => {
            await fixture.run('scoreboard objectives add kills dummy Kills');
            await fixture.run('scoreboard players set Steve kills 3');

            await expect(fixture.run('scoreboard objectives setdisplay sidebar kills')).resolves.toBe(1);

            const display = fixture.sent.filter((packet) => packet instanceof SetDisplayObjectivePacket).at(-1);
            expect(display?.objectiveName).toBe('kills');
            expect(display?.objectiveDisplayName).toBe('Kills');
            const scores = fixture.sent.filter((packet) => packet instanceof SetScorePacket).at(-1);
            expect(scores?.entries).toHaveLength(1);
        });

        it('clears the slot and drops the scores when the objective goes', async () => {
            await fixture.run('scoreboard objectives add kills dummy');
            await fixture.run('scoreboard players set Steve kills 3');
            await fixture.run('scoreboard objectives setdisplay sidebar kills');

            await expect(fixture.run('scoreboard objectives remove kills')).resolves.toBe(1);

            expect(fixture.sent.some((packet) => packet instanceof RemoveObjectivePacket)).toBe(true);
            await expect(fixture.run('scoreboard objectives list')).resolves.toBe(0);
        });

        it('answers execute if score off the same board', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('scoreboard objectives add kills dummy');
            await fixture.run('scoreboard players set Steve kills 5');

            await expect(fixture.run('execute if score Steve kills matches 5 run say yes')).resolves.toBe(1);
            await expect(fixture.run('execute if score Steve kills matches 6 run say yes')).resolves.toBe(0);
            await expect(fixture.run('execute if score @a kills matches 5 run say yes')).resolves.toBe(1);
        });

        it('captures a command result into a score through execute store', async () => {
            await fixture.run('scoreboard objectives add blocks dummy');

            await fixture.run('execute store result score counter blocks run fill 0 0 0 1 1 1 minecraft:stone');

            await fixture.run('scoreboard players get counter blocks');
            expect(fixture.feedback.at(-1)).toContain('counter has 8');
        });

        it('matches a selector on a score it holds', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            playerAt(fixture, 2n, 'Alex', new Vector3(1, 64, 0));
            await fixture.run('scoreboard objectives add kills dummy');
            await fixture.run('scoreboard players set Steve kills 9');

            await expect(fixture.run('tag @a[scores={kills=5..}] add veteran')).resolves.toBe(1);
            expect([...fixture.players[0]!.getTags()]).toEqual(['veteran']);
            expect([...fixture.players[1]!.getTags()]).toEqual([]);
        });
    });

    describe('random sequences', () => {
        it('draws inside the range it was given', async () => {
            for (let roll = 0; roll < 20; roll += 1) {
                const drawn = await fixture.run('random value 1..6 test:dice');
                expect(drawn).toBeGreaterThanOrEqual(1);
                expect(drawn).toBeLessThanOrEqual(6);
            }
        });

        it('advances, so two draws are not forced to agree', async () => {
            const draws = [];
            for (let roll = 0; roll < 32; roll += 1) draws.push(await fixture.run('random value 1..1000 test:wide'));

            expect(new Set(draws).size).toBeGreaterThan(1);
        });

        it('replays a sequence that was reset to a seed', async () => {
            await fixture.run('random reset test:seeded 42');
            const first = [await fixture.run('random value 1..1000 test:seeded')];
            first.push(await fixture.run('random value 1..1000 test:seeded'));

            await fixture.run('random reset test:seeded 42');
            const second = [await fixture.run('random value 1..1000 test:seeded')];
            second.push(await fixture.run('random value 1..1000 test:seeded'));

            expect(second).toEqual(first);
        });

        it('keys two sequences apart', async () => {
            await fixture.run('random reset test:one 7');
            await fixture.run('random reset test:two 7');

            const one = await fixture.run('random value 1..1000000 test:one');
            const two = await fixture.run('random value 1..1000000 test:two');
            expect(one).not.toBe(two);
        });
    });

    describe('experience', () => {
        it('adds points that carry into a level', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('xp add @a 10 points');
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(1);

            await fixture.run('xp query @a levels');
            expect(fixture.feedback.at(-1)).toContain('Steve has 1 levels');
        });

        it('adds and sets levels', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('xp add @a 5 levels');
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(5);

            await fixture.run('xp set @a 2 levels');
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(2);
        });

        it('never drops below level zero', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('xp add @a 2 levels');
            await fixture.run('xp add @a -9 levels');

            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(0);
            expect(player.attributes.getValue(AttributeIds.PlayerExperience)).toBe(0);
        });

        it('sets the bar just short of full rather than promoting the player', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            // Level 0 costs 7 points, and setting exactly 7 must not reach level 1.
            await fixture.run('xp set @a 7 points');

            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(0);
            await fixture.run('xp query @a points');
            expect(fixture.feedback.at(-1)).toContain('Steve has 6 points');
        });
    });

    describe('enchanting', () => {
        it('puts the enchantment on the held stack', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            player
                .getInventory()
                .setItemInHand(
                    new ContainerEntry({ item: new ItemStack({ name: 'minecraft:diamond_sword' }), count: 1 })
                );

            await expect(fixture.run('enchant @a sharpness 3')).resolves.toBe(1);

            expect(player.getInventory().getItemInHand().getEnchantmentLevel('minecraft:sharpness')).toBe(3);
        });

        it('refuses an empty hand by name', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('enchant @a sharpness')).rejects.toThrow(/not holding anything/);
        });
    });

    describe('loot', () => {
        /**
         * A content build holding two of Java's own table shapes: a block
         * table keyed the way `blocks/stone` is, and a plain table a
         * `/loot ... loot <id>` names.
         */
        const lootContent = (): ServerContent => {
            const definitions = definitionsOf({
                lootTablesJava: new Map([
                    [
                        'minecraft:blocks/stone',
                        definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
                            type: 'minecraft:block',
                            pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:stone' }] }]
                        })
                    ],
                    [
                        'mypack:prize',
                        definitionOf('lootTablesJava', 'mypack:prize', {
                            type: 'minecraft:chest',
                            pools: [{ rolls: 2, entries: [{ type: 'minecraft:item', name: 'minecraft:stone' }] }]
                        })
                    ]
                ])
            });
            return stub<ServerContent>({
                blocks: stub<ServerContent['blocks']>({ types: new Map<string, BlockType>() }),
                items: stub<ServerContent['items']>({ types: vanillaItemTypes() }),
                loot: new LootRegistry(
                    { ...definitions, lootTables: javaLootTables(definitions.lootTablesJava) },
                    { worldSeed: 1n }
                )
            });
        };

        it('names a table nobody registered rather than reporting an empty roll', async () => {
            fixture.useContent(lootContent());

            await expect(fixture.run('loot spawn 0 70 0 loot mypack:nothing')).rejects.toThrow(
                /no loot table called mypack:nothing/
            );
        });

        it('drops what the table rolled on the ground', async () => {
            fixture.useContent(lootContent());

            await expect(fixture.run('loot spawn 1 70 1 loot mypack:prize')).resolves.toBe(2);

            expect(fixture.dropped.at(-1)?.contents).toHaveLength(2);
        });

        it('gives what the table rolled to the players it named', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(lootContent());

            await expect(fixture.run('loot give @a loot mypack:prize')).resolves.toBe(2);

            expect(player.getInventory().getEntry(0)?.getCount()).toBe(2);
        });

        it('rolls the table of the block /loot mine names', async () => {
            fixture.useContent(lootContent());
            await fixture.run('setblock 2 70 2 minecraft:stone');

            // One stack of stone, which is what `minecraft:blocks/stone` says
            // a silk-touch-free break yields in this fixture's table.
            await expect(fixture.run('loot give @a mine 2 70 2')).resolves.toBe(0);
            await expect(fixture.run('loot spawn 3 70 3 mine 2 70 2')).resolves.toBe(1);
        });

        it('names the position when nothing standing there stores anything', async () => {
            fixture.useContent(lootContent());

            await expect(fixture.run('loot insert 0 70 0 loot mypack:prize')).rejects.toThrow(/no container at 0 70 0/);
        });
    });

    describe('recipes', () => {
        /** A book of two recipes, built through the real loader. */
        const recipeContent = (): ServerContent => {
            const loaded = loadRecipes([
                [
                    'mypack:cake',
                    {
                        type: 'minecraft:crafting_shapeless',
                        ingredients: ['minecraft:wheat'],
                        result: { id: 'minecraft:cake' }
                    }
                ],
                [
                    'mypack:torch',
                    {
                        type: 'minecraft:crafting_shapeless',
                        ingredients: ['minecraft:coal'],
                        result: { id: 'minecraft:torch' }
                    }
                ]
            ]);
            return stub<ServerContent>({ recipes: loaded.book });
        };

        it('names a recipe the book does not hold', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(recipeContent());

            await expect(fixture.run('recipe give @a mypack:nothing')).rejects.toThrow(/no recipe called/);
        });

        it('tells the client which recipe it just unlocked', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(recipeContent());

            await expect(fixture.run('recipe give @a mypack:cake')).resolves.toBe(1);

            const packet = fixture.sent.filter((entry) => entry instanceof UnlockedRecipesPacket).at(-1);
            expect(packet?.type).toBe(UnlockedRecipesType.NewlyUnlocked);
            expect(packet?.recipes).toEqual(['mypack:cake']);
        });

        it('changes nothing when the player already had it', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(recipeContent());

            await fixture.run('recipe give @a mypack:cake');
            await expect(fixture.run('recipe give @a mypack:cake')).resolves.toBe(0);
        });

        it('unlocks the whole book for a star, and locks it again', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(recipeContent());

            await expect(fixture.run('recipe give @a *')).resolves.toBe(1);
            const unlocked = fixture.sent.filter((entry) => entry instanceof UnlockedRecipesPacket).at(-1);
            expect(unlocked?.recipes).toEqual(['mypack:cake', 'mypack:torch']);

            await expect(fixture.run('recipe take @a *')).resolves.toBe(1);
            const locked = fixture.sent.filter((entry) => entry instanceof UnlockedRecipesPacket).at(-1);
            expect(locked?.type).toBe(UnlockedRecipesType.RemoveAll);
        });

        it('locks one recipe without touching the rest', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            fixture.useContent(recipeContent());

            await fixture.run('recipe give @a *');
            await expect(fixture.run('recipe take @a mypack:cake')).resolves.toBe(1);

            const packet = fixture.sent.filter((entry) => entry instanceof UnlockedRecipesPacket).at(-1);
            expect(packet?.type).toBe(UnlockedRecipesType.RemoveUnlocked);
            expect(packet?.recipes).toEqual(['mypack:cake']);
        });
    });
});
