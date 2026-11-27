/**
 * The server's `CommandHost`, exercised through the real command trees.
 *
 * Dispatched rather than called directly: the thing worth testing is that a
 * line a player types changes the world, and a verb asserted on its own would
 * pass even if nothing routed a command to it.
 */
import { CommandSyntaxException } from '@jsprismarine/brigadier';
import { createCommandSource } from '@jsprismarine/commands';
import type { CommandSource } from '@jsprismarine/commands';
import type { BlockType } from '@jsprismarine/blocks';
import { Gametype, TitleType } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { Types } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { formatSnbt } from '@jsprismarine/nbt/snbt';
import { floatTag } from '@jsprismarine/nbt/tag';
import type { GeneratorDefinition, LevelStem } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancementEngine } from '@jsprismarine/advancements';

import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { definitionsOf, definitionOf } from '../../content/ContentOptions';
import type { ServerContent } from '../../content/ServerContent';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { DamageCause } from '../../entity/DamageCause';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../entity/data/live';
import { DamageSource } from '../../entity/DamageSource';
import HumanInventory from '../../inventory/HumanInventory';
import { EntityInventory, mobLayout } from '../../inventory/EntityInventory';
import { itemOfDrop } from '../../inventory/persistence';
import { Item as ItemStack } from '../../item/Item';
import { vanillaItemTypes } from '../../item/vanillaItemTypes';
import AnimateEntityPacket from '@jsprismarine/protocol/bedrock/packet/AnimateEntityPacket';
import CameraShakePacket, {
    CameraShakeAction,
    CameraShakeType
} from '@jsprismarine/protocol/bedrock/packet/CameraShakePacket';
import PlayerFogPacket from '@jsprismarine/protocol/bedrock/packet/PlayerFogPacket';
import { forgetRecipeBook, loadRecipeBook, recipeBookOf } from '../../crafting/recipeBook';
import UnlockedRecipesPacket, {
    UnlockedRecipesType
} from '@jsprismarine/protocol/bedrock/packet/UnlockedRecipesPacket';
import { BedrockPresenter } from '../../editions/bedrock/presenter/BedrockPresenter';
import SetSpawnPositionPacket, {
    SpawnPositionType
} from '@jsprismarine/protocol/bedrock/packet/SetSpawnPositionPacket';
import SetTitlePacket from '@jsprismarine/protocol/bedrock/packet/SetTitlePacket';
import type { PermissionManager } from '../../permission/PermissionManager';
import type PlayerSession from '../../player/PlayerSession';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { sessionOnPrototype } from '../../testing/storePlayer.test.helper';
import { LootRegistry, javaLootTables } from '@jsprismarine/loot';
import { loadRecipes } from '@jsprismarine/recipes';
import { RemoveObjectivePacket, SetDisplayObjectivePacket, SetScorePacket } from '@jsprismarine/protocol';
import { writeBlockEntity } from '../../blockentity/blockEntityWrite';
import Chunk from '../../world/chunk/Chunk';
import { CommandStorage } from '../../world/CommandStorage';
import { Scoreboard } from '../../world/Scoreboard';
import { Dimensions } from '../../world/DimensionType';
import type GameRuleManager from '../../world/GameRuleManager';
import type { Level } from '../../world/Level';
import type { GameRuleEntry } from '../../world/GameRuleManager';
import { Position } from '../../world/Position';
import { DimensionTravel } from '../../world/portal/DimensionTravel';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { inertEntityRuntime, testContent } from '../../testing/entityServer';
import type { DataEntity, MobBody } from '../../entity/data/DataEntity';
import { Attributes as StoreAttributes } from '@jsprismarine/entities/attributes';
import type { AttributeWrite } from '@jsprismarine/entities/attributes';
import type { EntityInstance } from '@jsprismarine/entities/entityInstance';
import { StoreActor } from '../../entity/data/storeActors';
import { ObservedSet } from '../../entity/data/observedCollections';
import { inDispatch } from '../../testing/commandDispatch.test-utils';
import { collectAsyncCommands } from '../deferred';
import { buildVanillaCommands } from '../vanillaCommands';
import { serverCommandHost } from './serverCommandHost';
import { entityRefOf } from './support';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';

/** What the fixture's permission manager was asked to reload. */
const permissionReloads: string[] = [];

/** One block position's contents, keyed as `x,y,z`. */
type BlockTable = Map<string, { name: string; states: Record<string, string | number | boolean> }>;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** A store entity's attributes with the health a type declares, recording each write the change log would. */
const storeHealth = (max: number) => {
    const writes: AttributeWrite[] = [];
    const attributes = new StoreAttributes(new Map(), (write) => writes.push(write));
    attributes.define('health', { base: max });
    writes.length = 0;
    return {
        attributes,
        writes,
        // What a slot name resolves against too: no inventory component and no equippable slots.
        instance: stub<EntityInstance>({ attributes, componentParams: () => undefined, hasComponent: () => false })
    };
};

interface Fixture {
    readonly server: Server;
    readonly world: World;
    /** The Nether world, built for this fixture, where a cross-dimension `/tp` lands. */
    readonly nether: World;
    /** The travel service a cross-dimension `/tp` files its move with. */
    readonly travel: DimensionTravel;
    readonly blocks: BlockTable;
    /** The block entity standing at a position, as its compound. */
    blockEntityAt(x: number, y: number, z: number): NBTTagCompound | undefined;
    readonly rules: Map<string, GameRuleEntry>;
    readonly entities: StoreActor[];
    readonly players: PlayerSession[];
    readonly sent: unknown[];
    readonly feedback: string[];
    readonly errors: string[];
    /** Runs one command line as the console and answers what it returned. */
    run(line: string, as?: PlayerSession): Promise<number>;
    /** Everything `World.dropContents` was asked to put on the ground. */
    readonly dropped: { position: Vector3; contents: unknown[] }[];
    /** Puts a content build behind the server, which is what `/loot` reads. */
    useContent(built: ServerContent): void;
}

/** The one generator a stem can name without settings; nothing here builds a world from it. */
const DEBUG: GeneratorDefinition = { type: 'minecraft:debug' };

const buildFixture = (): Fixture => {
    const blocks: BlockTable = new Map();
    // Real chunks, made as a position first reaches one, so a block entity has somewhere to stand.
    const chunks = new Map<string, Chunk>();
    const chunkAt = (chunkX: number, chunkZ: number): Chunk => {
        const id = `${chunkX},${chunkZ}`;
        const existing = chunks.get(id);
        if (existing !== undefined) return existing;
        const made = new Chunk(chunkX, chunkZ);
        chunks.set(id, made);
        return made;
    };
    const rules = new Map<string, GameRuleEntry>([
        ['sendCommandFeedback', [true, true]],
        ['fallDamage', [true, true]],
        ['randomTickSpeed', [3, true]]
    ]);
    const entities: StoreActor[] = [];
    const players: PlayerSession[] = [];
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

    /** The destination of a cross-dimension `/tp`; nothing happens in it. */
    const nether: World = stub<World>({
        getDimension: () => Dimensions.Nether,
        getActors: () => [],
        getActor: () => null,
        getLevel: () => level,
        getServer: () => server
    });

    // Annotated, because `world` and `server` name each other: without a declared type
    // TypeScript would have to infer one from the other and gives up.
    const world: World = stub<World>({
        getDimension: () => Dimensions.Overworld,
        getGameRuleManager: () => gameRules,
        getActors: () => entities,
        getActor: (runtimeId: bigint) => entities.find((entity) => entity.getRuntimeId() === runtimeId) ?? null,
        getViewers: () => players,
        viewerOf: (runtimeId: bigint) => players.find((player) => player.getRuntimeId() === runtimeId),
        getTicks: () => ticks,
        setTicks: (value: number) => {
            ticks = value;
        },
        getDayTime: () => dayTime,
        setDayTime: (value: number) => {
            dayTime = value;
        },
        sendTime: async () => {},
        syncTime: () => {},
        breakBlock: (position: Vector3) => {
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
            // As a real write does: the block entity belonged to the block that went away.
            chunkAt(x >> 4, z >> 4).removeBlockEntity(x, y, z);
            return true;
        },
        getLoadedChunk: chunkAt,
        blockEntityChanged: () => {},
        getSeed: () => 1n,
        // Inert, which declares no entity types for `/summon` to build.
        dataEntities: () => inertEntityRuntime(),
        // Late-bound: an entity class reads the server off the world it is
        // built in, and the server double is built from this one.
        getServer: () => server,
        getLevel: () => level
    });
    let ticks = 0;
    // Apart from the game clock, as a world keeps them, so a host that moves the wrong one shows.
    let dayTime = 0;

    // Two stems, so `/execute in the_nether` parses; the Nether's world is ready for a move but,
    // as a lazy dimension's is, not among the loaded worlds.
    const scoreboard = new Scoreboard();
    const commandStorage = new CommandStorage();
    const level = stub<Level>({
        getScoreboard: () => scoreboard,
        getCommandStorage: () => commandStorage,
        getStems: () =>
            new Map<string, LevelStem>([
                [Dimensions.Overworld.id, { type: Dimensions.Overworld.id, generator: DEBUG }],
                [Dimensions.Nether.id, { type: Dimensions.Nether.id, generator: DEBUG }]
            ]),
        worlds: function* () {
            yield world;
        },
        readyWorld: (stemId) => (stemId === Dimensions.Nether.id ? nether : undefined),
        loadedWorld: (stemId) => (stemId === Dimensions.Overworld.id ? world : undefined),
        prepareWorld: async () => {}
    });

    const server: Server = stub<Server>({
        getLogger: () => stub({ debug: () => {}, verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getWorldManager: () =>
            stub<WorldManager>({
                getEntryWorld: () => world,
                getEntryLevel: () => level,
                getLevels: () => [level],
                getWorldByDimension: (dimension) => (dimension === Dimensions.Overworld.id ? world : undefined),
                startWorld: (dimension) => (dimension === Dimensions.Overworld.id ? world : undefined),
                stemFor: (dimension) =>
                    dimension === Dimensions.Nether.id ? { level, stemId: Dimensions.Nether.id } : undefined
            }),
        getSessionManager: () => stub({ getSessions: () => players }),
        getPermissionManager: () =>
            stub<PermissionManager>({
                isOp: () => false,
                setOp: async () => true,
                reload: async () => {
                    permissionReloads.push('permissions.reload');
                },
                can: () => ({ execute: () => true, not: () => ({ execute: () => false }) })
            }),
        getRandom: () => () => 0.5,
        getDimensionTravel: () => travel,
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
    const travel = new DimensionTravel(server);

    // Include these names in the command parser so the host can refuse them when its
    // data-driven runtime does not declare them.
    const registry = buildVanillaCommands({ entityTypes: ['minecraft:tnt', 'minecraft:allay'] });
    const host = serverCommandHost(server);

    const sourceFor = (as?: PlayerSession): CommandSource =>
        createCommandSource({
            host,
            ...(as === undefined ? {} : { entity: refOf(as) }),
            permissionLevel: 5,
            onFeedback: (message) => feedback.push(message),
            onError: (message) => errors.push(message)
        });

    const refOf = (player: PlayerSession) => ({
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
        nether,
        travel,
        blocks,
        blockEntityAt: (x, y, z) =>
            chunkAt(x >> 4, z >> 4)
                .getBlockEntity(x, y, z)
                ?.toNBT(),
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

/**
 * A store entity double that answers everything `entityRefOf` reads, in a world whose live
 * runtime records the kills, blows and removals the command host asks it for.
 */
const mobAt = (fixture: Fixture, id: bigint, type: string, position: Vector3, alive = true) => {
    const kill = vi.fn<LiveEntityRuntime['killEntity']>(() => true);
    const damage = vi.fn<LiveEntityRuntime['damageEntity']>(() => true);
    const remove = vi.fn<EntityRuntime['remove']>(() => true);
    const teleportTo = vi.fn();
    const health = storeHealth(10);
    const live = stub<LiveEntityRuntime>({
        killEntity: kill,
        damageEntity: damage,
        runtime: stub<EntityRuntime>({ remove })
    });
    // The fixture's world, answering this entity's live runtime.
    const world: World = Object.assign(Object.create(fixture.world), { dataEntities: () => live });
    const actor = stubOf(StoreActor, {
        entity: stub<DataEntity>({
            id: Number(id),
            body: stub<MobBody>({
                yaw: 0,
                pitch: 0,
                teleportTo,
                tags: new ObservedSet<string>(),
                velocity: { x: 0, y: 0, z: 0 },
                inventory: new EntityInventory(mobLayout(0)),
                fireTicks: 0,
                invulnerable: false,
                deathTime: 0
            }),
            instance: health.instance,
            conditions: new Set<string>()
        }),
        getPortalCooldown: () => 0,
        getRuntimeId: () => id,
        getType: () => type,
        getName: () => type.split(':')[1]!,
        getPosition: () => Position.fromVector3(position, fixture.world),
        getFeetY: () => position.getY(),
        getWorld: () => world,
        isAlive: () => alive,
        // An entity that is not alive here is one with no health at all, such as a boat.
        getMaxHealth: () => (alive ? 10 : 0)
    });
    for (const angle of ['yaw', 'pitch', 'headYaw']) Object.defineProperty(actor, angle, { value: 0 });
    fixture.entities.push(actor);
    return { actor, kill, damage, remove, teleportTo, health };
};

const playerAt = (fixture: Fixture, id: bigint, name: string, position: Vector3, alive = true): PlayerSession => {
    const inventory = new HumanInventory();
    const tags = new Set<string>();
    const player = sessionOnPrototype(
        {
            getName: () => name,
            gamemode: Gametype.SURVIVAL,
            setGamemode: vi.fn().mockResolvedValue(undefined),
            setPlayerPosition: vi.fn().mockResolvedValue(undefined),
            getInventory: () => inventory,
            getWorld: () => fixture.world,
            // What `keyed()` and the advancement triggers read the server through.
            getServer: () => fixture.server,
            // One session per player, so a test can read back what the player's session was told.
            send: async (packet: unknown) => {
                fixture.sent.push(packet);
            },
            presenter: new BedrockPresenter({
                sendDataPacket: async (packet) => {
                    fixture.sent.push(packet);
                }
            }),
            sendInventory: async () => {},
            sendAttributes: async () => {},
            sendMessage: vi.fn().mockResolvedValue(undefined),
            kick: vi.fn().mockResolvedValue(undefined),
            changeWorld: vi.fn().mockResolvedValue(undefined),
            isConnected: () => true,
            getPosition: () => Position.fromVector3(position, fixture.world)
        },
        {
            runtimeId: id,
            uuid: UUID.fromString(`00000000-0000-0000-0000-${id.toString().padStart(12, '0')}`),
            // What a selector and a reference read of the player's actor.
            actor: {
                getPosition: () => Position.fromVector3(position, fixture.world),
                getFeetY: () => position.getY(),
                getWorld: () => fixture.world,
                isAlive: () => alive,
                getTags: () => [...tags],
                addTag: (tag: string) => !tags.has(tag) && tags.add(tag).has(tag),
                removeTag: (tag: string) => tags.delete(tag),
                attributes: new Attributes(Attributes.getPlayerDefaults()),
                // The store entity, whose `health` attribute `max_health` is kept in.
                entity: stub<DataEntity>({
                    id: Number(id),
                    instance: storeHealth(20).instance,
                    // What `/data get entity` reads of a player's body.
                    body: stub<MobBody>({ fireTicks: 0, invulnerable: false, deathTime: 0 })
                }),
                getVelocity: () => new Vector3(0, 0, 0),
                isOnGround: () => true,
                getPortalCooldown: () => 0,
                getHealth: () => 20,
                getMaxHealth: () => 20,
                yaw: 0,
                pitch: 0,
                headYaw: 0
            }
        }
    );
    fixture.entities.push(player.getActor()!);
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

            expect(fixture.blocks.get(key(0, 0, 0))?.states).toEqual({ weirdo_direction: 2 });
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

        it('replaces only the blocks a replace filter names', async () => {
            await fixture.run('fill 0 0 0 1 0 0 minecraft:stone');
            await fixture.run('fill 2 0 0 3 0 0 minecraft:obsidian');

            await expect(fixture.run('fill 0 0 0 3 0 0 minecraft:dirt replace minecraft:stone')).resolves.toBe(2);

            expect(fixture.blocks.get(key(0, 0, 0))?.name).toBe('minecraft:dirt');
            expect(fixture.blocks.get(key(1, 0, 0))?.name).toBe('minecraft:dirt');
            expect(fixture.blocks.get(key(2, 0, 0))?.name).toBe('minecraft:obsidian');
            // Air matches no filter either, so the rest of the region stays empty.
            expect(fixture.blocks.has(key(0, 1, 0))).toBe(false);
        });

        it('changes nothing when the filter names the block it fills with', async () => {
            await fixture.run('fill 0 0 0 1 0 0 minecraft:obsidian');

            await expect(fixture.run('fill 0 0 0 3 1 0 minecraft:obsidian replace minecraft:obsidian')).resolves.toBe(
                0
            );
            expect(fixture.blocks.size).toBe(2);
        });

        it('matches a filter with no states against every state of its block', async () => {
            await fixture.run('setblock 0 0 0 minecraft:portal ["portal_axis"="x"]');
            await fixture.run('setblock 1 0 0 minecraft:portal ["portal_axis"="z"]');

            await expect(fixture.run('fill 0 0 0 1 0 0 minecraft:stone replace minecraft:portal')).resolves.toBe(2);
        });

        it('matches only the states a filter lists', async () => {
            await fixture.run('setblock 0 0 0 minecraft:portal ["portal_axis"="x"]');
            await fixture.run('setblock 1 0 0 minecraft:portal ["portal_axis"="z"]');

            await expect(
                fixture.run('fill 0 0 0 1 0 0 minecraft:stone replace minecraft:portal ["portal_axis"="z"]')
            ).resolves.toBe(1);
            expect(fixture.blocks.get(key(0, 0, 0))?.name).toBe('minecraft:portal');
            expect(fixture.blocks.get(key(1, 0, 0))?.name).toBe('minecraft:stone');
        });

        it('matches a true or false filter against a bit state the catalog stores as 1 or 0', async () => {
            // As the catalog stores a door: `open_bit` is a byte.
            fixture.blocks.set(key(0, 0, 0), { name: 'minecraft:wooden_door', states: { open_bit: 1 } });
            fixture.blocks.set(key(1, 0, 0), { name: 'minecraft:wooden_door', states: { open_bit: 0 } });

            await expect(
                fixture.run('fill 0 0 0 1 0 0 minecraft:stone replace minecraft:wooden_door ["open_bit"=true]')
            ).resolves.toBe(1);
            expect(fixture.blocks.get(key(0, 0, 0))?.name).toBe('minecraft:stone');

            await expect(
                fixture.run('fill 0 0 0 1 0 0 minecraft:stone replace minecraft:wooden_door ["open_bit"=false]')
            ).resolves.toBe(1);
            expect(fixture.blocks.get(key(1, 0, 0))?.name).toBe('minecraft:stone');
        });

        it('matches nothing for a filter state the block does not have', async () => {
            await fixture.run('setblock 0 0 0 minecraft:portal ["portal_axis"="x"]');

            await expect(
                fixture.run('fill 0 0 0 0 0 0 minecraft:stone replace minecraft:portal ["missing"="undefined"]')
            ).resolves.toBe(0);
            expect(fixture.blocks.get(key(0, 0, 0))?.name).toBe('minecraft:portal');
        });

        it('gives a placed block the block entity it carries, of its own type', async () => {
            await fixture.run('setblock 1 2 3 minecraft:mob_spawner');
            await fixture.run('setblock 2 2 3 minecraft:chest');
            await fixture.run('setblock 3 2 3 minecraft:standing_sign');

            expect(fixture.blockEntityAt(1, 2, 3)?.getString('id', '')).toBe('MobSpawner');
            expect(fixture.blockEntityAt(2, 2, 3)?.getString('id', '')).toBe('Chest');
            // Bedrock files a standing sign under `Sign`, not the block's own name.
            expect(fixture.blockEntityAt(3, 2, 3)?.getString('id', '')).toBe('Sign');
            // Filed where the block is, which is where a client and the next save read it.
            expect(fixture.blockEntityAt(1, 2, 3)?.getNumber('y', -1)).toBe(2);
        });

        it('makes an empty chest a block entity /data reads, as Java answers it', async () => {
            await fixture.run('setblock 0 0 0 minecraft:chest');

            await expect(fixture.run('data get block 0 0 0 Items')).resolves.toBe(0);
        });

        it('gives no block entity to a block that carries none', async () => {
            await fixture.run('setblock 1 2 3 minecraft:stone');

            expect(fixture.blockEntityAt(1, 2, 3)).toBeUndefined();
        });

        it('gives every block a fill places its block entity', async () => {
            await fixture.run('fill 0 0 0 1 0 0 minecraft:mob_spawner');

            expect(fixture.blockEntityAt(0, 0, 0)?.getString('id', '')).toBe('MobSpawner');
            expect(fixture.blockEntityAt(1, 0, 0)?.getString('id', '')).toBe('MobSpawner');
        });

        it('clones a block entity with its contents, moved with the block', async () => {
            await fixture.run('setblock 0 0 0 minecraft:chest');
            const source = fixture.blockEntityAt(0, 0, 0);
            source?.addValue('CustomName', new Types.StringVal('loot'));
            if (source !== undefined) writeBlockEntity(fixture.world, source);

            await fixture.run('clone 0 0 0 0 0 0 10 0 10');

            const copy = fixture.blockEntityAt(10, 0, 10);
            expect(copy?.getString('CustomName', '')).toBe('loot');
            expect(copy?.getNumber('x', -1)).toBe(10);
            expect(copy?.getNumber('z', -1)).toBe(10);
            // The source keeps its own.
            expect(fixture.blockEntityAt(0, 0, 0)?.getString('CustomName', '')).toBe('loot');
        });

        it("moves a cloned double chest's pair with it, so the copies pair with each other", async () => {
            await fixture.run('setblock 0 0 0 minecraft:chest');
            await fixture.run('setblock 1 0 0 minecraft:chest');
            const half = fixture.blockEntityAt(0, 0, 0);
            half?.addValue('pairx', new Types.NumberVal(1));
            half?.addValue('pairz', new Types.NumberVal(0));
            if (half !== undefined) writeBlockEntity(fixture.world, half);

            await fixture.run('clone 0 0 0 1 0 0 10 0 10');

            expect(fixture.blockEntityAt(10, 0, 10)?.getNumber('pairx', -1)).toBe(11);
            expect(fixture.blockEntityAt(10, 0, 10)?.getNumber('pairz', -1)).toBe(10);
        });

        it('drops the pair of a cloned chest half whose partner the clone leaves behind', async () => {
            await fixture.run('setblock 0 0 0 minecraft:chest');
            await fixture.run('setblock 1 0 0 minecraft:chest');
            const half = fixture.blockEntityAt(0, 0, 0);
            half?.addValue('pairx', new Types.NumberVal(1));
            half?.addValue('pairz', new Types.NumberVal(0));
            half?.addValue('pairlead', new Types.ByteVal(1));
            if (half !== undefined) writeBlockEntity(fixture.world, half);

            await fixture.run('clone 0 0 0 0 0 0 10 0 10');

            const copy = fixture.blockEntityAt(10, 0, 10);
            expect(copy?.getString('id', '')).toBe('Chest');
            expect(copy?.has('pairx')).toBe(false);
            expect(copy?.has('pairz')).toBe(false);
            expect(copy?.has('pairlead')).toBe(false);
        });

        it('clones a block entity onto the same block standing at the destination', async () => {
            await fixture.run('setblock 0 0 0 minecraft:chest');
            await fixture.run('setblock 10 0 10 minecraft:chest');
            const source = fixture.blockEntityAt(0, 0, 0);
            source?.addValue('CustomName', new Types.StringVal('loot'));
            if (source !== undefined) writeBlockEntity(fixture.world, source);

            await fixture.run('clone 0 0 0 0 0 0 10 0 10');

            expect(fixture.blockEntityAt(10, 0, 10)?.getString('CustomName', '')).toBe('loot');
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

        it('kills a living entity by taking its health, with the cause nothing refuses', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await fixture.run('kill @e');

            // The cause is load-bearing: the ender dragon's damage rules turn aside a
            // generic attacker-less blow, and `self_destruct` is what gets through.
            expect(pig.kill).toHaveBeenCalledWith(
                pig.actor,
                expect.objectContaining({ cause: DamageCause.SelfDestruct }),
                'command'
            );
        });

        it('passes over a mob in its death animation, as Java selects only living entities', async () => {
            const dying = mobAt(fixture, 7n, 'minecraft:pig', new Vector3(0, 0, 0));
            Object.defineProperty(dying.actor, 'isAlive', { value: () => false });

            await expect(fixture.run('kill @e')).resolves.toBe(0);
            expect(dying.kill).not.toHaveBeenCalled();
        });

        it('removes an entity that has no health to take', async () => {
            const item = mobAt(fixture, 7n, 'minecraft:boat', new Vector3(0, 0, 0), false);

            await expect(fixture.run('kill @e')).resolves.toBe(1);
            expect(item.remove).toHaveBeenCalledWith(7, 'body removed');
            expect(item.kill).not.toHaveBeenCalled();
        });

        it('leaves a dead player in the store for their respawn', async () => {
            const remove = vi.fn<EntityRuntime['remove']>(() => true);
            const kill = vi.fn<LiveEntityRuntime['killEntity']>(() => true);
            const dataEntities = vi
                .spyOn(fixture.world, 'dataEntities')
                .mockReturnValue(
                    stub<LiveEntityRuntime>({ killEntity: kill, runtime: stub<EntityRuntime>({ remove }) })
                );
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0), false);

            await expect(fixture.run('kill @a')).resolves.toBe(0);
            expect(remove).not.toHaveBeenCalled();
            expect(kill).not.toHaveBeenCalled();
            dataEntities.mockRestore();
        });

        it('stands a player with their feet at the position a same-world `/tp` names', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('tp @a 10 70 10')).resolves.toBe(1);
            // Java reads `/tp` coordinates as feet; a player's stored position is their eyes,
            // 1.62 up, like the world change below. Written in raw, the player would stand
            // 1.62 blocks down in the floor.
            expect(player.setPlayerPosition).toHaveBeenCalledWith(
                expect.objectContaining({ position: expect.objectContaining({ x: 10, y: 71.62, z: 10 }) })
            );
        });

        it('puts any other entity at the raw position a `/tp` names', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 64, 0));

            await expect(fixture.run('tp @e 10 70 10')).resolves.toBe(1);
            expect(pig.teleportTo).toHaveBeenCalledWith({ x: 10, y: 70, z: 10 });
        });

        it('teleports a store entity in the store, which owns where it stands', async () => {
            const teleportTo = vi.fn();
            const actor = stubOf(StoreActor, {
                entity: stub<DataEntity>({ id: 7, body: stub<MobBody>({ yaw: 0, pitch: 0, teleportTo }) }),
                getRuntimeId: () => 7n,
                getType: () => 'minecraft:pig',
                getName: () => '',
                getPosition: () => new Vector3(0, 64, 0),
                getFeetY: () => 64,
                getWorld: () => fixture.world,
                isAlive: () => true
            });
            fixture.entities.push(actor);

            await expect(fixture.run('tp @e 10 70 10')).resolves.toBe(1);

            expect(teleportTo).toHaveBeenCalledWith({ x: 10, y: 70, z: 10 });
        });

        it('moves a player into another dimension at the requested position, in one move', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('execute in the_nether run tp @a 10 70 10')).resolves.toBe(1);

            // A message: the command filed the move and changed nothing, and the next input step
            // carries it out.
            expect(player.changeWorld).not.toHaveBeenCalled();
            expect(fixture.travel.pending).toBe(1);
            expect(fixture.travel.admit()).toBe(1);

            // The world change carries the position, so the player does not land at the
            // Nether's spawn first, and `setPlayerPosition` is not run in the world being left.
            expect(player.changeWorld).toHaveBeenCalledWith(
                {
                    world: fixture.nether,
                    position: new Vector3(10, 70, 10),
                    yaw: 0,
                    pitch: 0
                },
                { then: expect.any(Function) }
            );
            expect(player.setPlayerPosition).not.toHaveBeenCalled();
        });

        it('takes the dimension of a cross-dimension `/tp` as a namespaced Java id', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('execute in minecraft:the_nether run tp @a 10 70 10')).resolves.toBe(1);
            fixture.travel.admit();

            expect(player.changeWorld).toHaveBeenCalledWith(
                expect.objectContaining({ world: fixture.nether, position: new Vector3(10, 70, 10) }),
                { then: expect.any(Function) }
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
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(5);
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
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(2);
            // The stack's own count is what the client is sent, so it has to go down as well.
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(2);
        });

        it('adds, lists and removes a tag', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await expect(fixture.run('tag @e add winner')).resolves.toBe(1);
            expect(pig.actor.getTags()).toEqual(['winner']);

            await expect(fixture.run('tag @e add winner')).resolves.toBe(0);
            await expect(fixture.run('tag @e remove winner')).resolves.toBe(1);
            expect(pig.actor.getTags()).toEqual([]);
        });

        it('selects by a tag it was given', async () => {
            mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));
            const cow = mobAt(fixture, 2n, 'minecraft:cow', new Vector3(0, 0, 0));
            await fixture.run('tag @e[type=cow] add keep');

            await expect(fixture.run('kill @e[tag=keep]')).resolves.toBe(1);
            expect(cow.kill).toHaveBeenCalled();
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

        // `/attribute` is not registered here (modifiers are missing), so these call its verbs.
        it("sets a player's maximum health on its store entity, where its health is read", () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            const health = player.getActor()!.entity.instance.attributes;
            const host = serverCommandHost(fixture.server).entities;
            const ref = entityRefOf(player.getActor()!);

            expect(host.setAttributeBase(ref, 'minecraft:max_health', 10)).toBe(true);

            expect(health.get('health')).toMatchObject({ max: 10, current: 10 });
            expect(host.getAttributeBase(ref, 'max_health')).toBe(10);
            expect(host.getAttributeValue(ref, 'max_health')).toBe(10);
        });

        it("writes a mob's maximum health through its store attribute, which reports the write", () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));
            const host = serverCommandHost(fixture.server).entities;
            const ref = entityRefOf(pig.actor);

            expect(host.setAttributeBase(ref, 'minecraft:max_health', 4)).toBe(true);

            expect(pig.health.writes).toEqual([
                {
                    name: 'health',
                    before: { base: 10, min: 0, max: 10, current: 10 },
                    after: { base: 4, min: 0, max: 4, current: 4 }
                }
            ]);
            // Setting it again changes nothing, and says so.
            expect(host.setAttributeBase(ref, 'minecraft:max_health', 4)).toBe(false);
        });

        it('damages an entity', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 0, 0));

            await expect(fixture.run('damage @e 4')).resolves.toBe(1);
            expect(pig.damage).toHaveBeenCalledWith(pig.actor, 4, expect.anything(), 'command');
        });

        describe('/damage sources', () => {
            /** The source the pig was hurt with, by whichever player ran the command. */
            const hurtWith = async (line: string) => {
                const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(0, 64, 0));
                const player = playerAt(fixture, 2n, 'Steve', new Vector3(1, 64, 0));
                await fixture.run(line, player);
                const [, , source] = pig.damage.mock.calls[0] ?? [];
                if (!(source instanceof DamageSource)) throw new Error('the pig was not hurt with a DamageSource');
                return { pig, player, source };
            };

            it('has no source entity when the command names none, even from a player', async () => {
                const { source } = await hurtWith('damage @e[type=pig] 4');

                expect(source.attacker).toBeNull();
            });

            it('blames the entity a `by` clause names', async () => {
                const { player, source } = await hurtWith('damage @e[type=pig] 4 minecraft:fire by @s');

                // The player's body, which is the entity a blow names.
                expect(source.attacker).toBe(player.shown());
            });
        });
    });

    describe('the world', () => {
        it('sets and queries the time', async () => {
            await expect(fixture.run('time set 6000')).resolves.toBe(6000);
            await expect(fixture.run('time query daytime')).resolves.toBe(6000);
        });

        it('leaves the game clock where it was when it sets the time of day', async () => {
            await expect(fixture.run('time set 6000')).resolves.toBe(6000);

            await expect(fixture.run('time query gametime')).resolves.toBe(0);
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
            // The spawn goes out once the level data is saved, which the command does not wait for.
            const shown = Promise.withResolvers<unknown>();
            fixture.players.push(
                stub<PlayerSession>({
                    presenter: new BedrockPresenter({ sendDataPacket: async (packet) => shown.resolve(packet) })
                })
            );

            await expect(fixture.run('setworldspawn 8 65 8')).resolves.toBe(1);

            expect(fixture.world.setSpawnPosition).toHaveBeenCalled();
            const packet = await shown.promise;
            if (!(packet instanceof SetSpawnPositionPacket)) throw new Error('expected SetSpawnPositionPacket');
            expect(packet.getPacketData()).toMatchObject({
                type: SpawnPositionType.WorldSpawn,
                position: { x: 8, y: 65, z: 8 }
            });
        });
    });

    describe('reload', () => {
        it('reloads the behavior pack functions, scripts and the permission files, as Bedrock’s /reload does, and keeps the server running', async () => {
            const calls: string[] = [];
            permissionReloads.length = 0;
            const server = Object.assign(Object.create(fixture.server), {
                getCommandManager: () => ({
                    reloadFunctions: () => {
                        calls.push('reloadFunctions');
                    }
                }),
                getAddons: () => ({
                    // The real sync reloads the scripts itself when asked to.
                    sync: async (options: { readonly reload?: boolean | 'always' }) => {
                        calls.push(`sync ${String(options.reload)}`);
                    }
                }),
                reloadScripts: async () => {
                    calls.push('reloadScripts');
                },
                reload: () => {
                    calls.push('reload');
                }
            });

            await inDispatch(() => serverCommandHost(server).server.reload());

            expect(calls).toEqual(['reloadFunctions', 'sync always']);
            expect(permissionReloads).toEqual(['permissions.reload']);
        });

        it('reloads the scripts though the addons could not sync, and logs why', async () => {
            const calls: string[] = [];
            const errors: string[] = [];
            const server = Object.assign(Object.create(fixture.server), {
                getCommandManager: () => ({ reloadFunctions: () => {} }),
                getAddons: () => ({
                    sync: async () => {
                        throw new Error('addons.json is invalid');
                    }
                }),
                getLogger: () => ({ error: (message: string) => errors.push(message) }),
                reloadScripts: async () => {
                    calls.push('reloadScripts');
                }
            });

            await inDispatch(() => serverCommandHost(server).server.reload());

            expect(calls).toEqual(['reloadScripts']);
            expect(errors).toEqual(['Could not sync the addons: addons.json is invalid']);
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

    describe('the NBT of blocks and entities', () => {
        it("reads a mob's data in Java's shape, and one field of it by path", async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(1, 64, 2));
            await fixture.run('tag @e add winner');

            await expect(fixture.run('data get entity @e[type=pig,limit=1] Health')).resolves.toBe(10);
            expect(fixture.feedback.at(-1)).toBe('pig has the following entity data: 10.0f');

            const data = serverCommandHost(fixture.server).data;
            const entity = { kind: 'entity', entity: entityRefOf(pig.actor) } as const;
            expect(data.getData(entity, 'Pos')?.snbt).toBe('[1.0d, 64.0d, 2.0d]');
            expect(data.getData(entity, 'Tags')?.snbt).toBe('["winner"]');
            expect(data.countData(entity, 'NoSuchField')).toBe(0);
        });

        it('writes the fields it models back onto a mob, and drops the rest', async () => {
            const pig = mobAt(fixture, 1n, 'minecraft:pig', new Vector3(1, 64, 2));

            await expect(
                fixture.run(
                    'data merge entity @e[type=pig,limit=1] {Health: 4.0f, Tags: ["a"], Pos: [5.0d, 70.0d, 6.0d]}'
                )
            ).resolves.toBe(1);

            expect(pig.health.instance.attributes.get('health')?.current).toBe(4);
            expect(pig.actor.getTags()).toEqual(['a']);
            expect(pig.teleportTo).toHaveBeenCalledWith({ x: 5, y: 70, z: 6 });
        });

        it("reads a player's data, and refuses to write it, as Java does", async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('item replace entity @a hotbar.1 with minecraft:stone 3');

            await expect(fixture.run('data get entity @a Inventory[0].count')).resolves.toBe(3);
            await expect(fixture.run('data merge entity @a {Health: 1.0f}')).rejects.toThrow(
                'Unable to modify player data'
            );
            expect(player.getActor()!.entity.instance.attributes.get('health')?.current).toBe(20);
        });

        it('refuses a block that is not a block entity', () => {
            const data = serverCommandHost(fixture.server).data;
            const block = {
                kind: 'block',
                dimension: Dimensions.Overworld.id,
                position: { x: 0, y: 0, z: 0 }
            } as const;

            expect(() => data.getData(block)).toThrow('The target block is not a block entity');
        });
    });

    describe('command storage', () => {
        const storage = { kind: 'storage', id: 'mypack:state' } as const;
        const value = (snbt: string) => ({ kind: 'value', snbt }) as const;

        it('reads the empty compound from a storage nobody wrote', () => {
            expect(serverCommandHost(fixture.server).data.getData(storage)).toEqual({ snbt: '{}', result: 1 });
        });

        it("answers Java's result for each kind of tag", () => {
            const data = serverCommandHost(fixture.server).data;
            data.mergeData(storage, '{n: 7.9d, neg: -1.5f, list: [1, 2, 3], text: "four", c: {a: 1b}, ids: [I; 1, 2]}');

            expect(data.getData(storage, 'n')).toEqual({ snbt: '7.9d', result: 7 });
            expect(data.getData(storage, 'neg')).toEqual({ snbt: '-1.5f', result: -2 });
            expect(data.getData(storage, 'list')).toEqual({ snbt: '[1, 2, 3]', result: 3 });
            expect(data.getData(storage, 'text')).toEqual({ snbt: '"four"', result: 4 });
            expect(data.getData(storage, 'c')).toEqual({ snbt: '{a: 1b}', result: 1 });
            expect(data.getData(storage, 'ids')).toEqual({ snbt: '[I; 1, 2]', result: 2 });
            expect(data.getData(storage, 'missing')).toBeUndefined();
        });

        it('scales a numeric tag and refuses to scale anything else', () => {
            const data = serverCommandHost(fixture.server).data;
            data.mergeData(storage, '{n: 7, list: [1, 2]}');

            expect(data.getData(storage, 'n', 0.5)?.result).toBe(3);
            expect(data.getData(storage, 'n', -0.5)?.result).toBe(-4);
            expect(() => data.getData(storage, 'list', 2)).toThrow("Can't get list; only numeric tags are allowed");
        });

        it('refuses a path that matches several tags where one is read', () => {
            const data = serverCommandHost(fixture.server).data;
            data.mergeData(storage, '{list: [1, 2]}');

            expect(() => data.getData(storage, 'list[]')).toThrow(
                'Only one element allowed, but path list[] matched 2'
            );
            expect(data.countData(storage, 'list[]')).toBe(2);
        });

        it('reports whether a merge changed anything', () => {
            const data = serverCommandHost(fixture.server).data;

            expect(data.mergeData(storage, '{a: 1}')).toBe(true);
            expect(data.mergeData(storage, '{a: 1}')).toBe(false);
        });

        it('sets, appends, prepends, inserts and merges, and counts what changed', () => {
            const data = serverCommandHost(fixture.server).data;

            expect(data.modifyData(storage, 'list', 'set', value('[2]'))).toBe(1);
            expect(data.modifyData(storage, 'list', 'set', value('[2]'))).toBe(0);
            expect(data.modifyData(storage, 'list', 'append', value('3'))).toBe(1);
            expect(data.modifyData(storage, 'list', 'prepend', value('0'))).toBe(1);
            expect(data.modifyData(storage, 'list', 'insert', value('1'), 1)).toBe(1);
            expect(data.modifyData(storage, 'obj', 'merge', value('{a: 1}'))).toBe(1);
            expect(data.modifyData(storage, 'obj', 'merge', value('{a: 1}'))).toBe(0);

            expect(data.getData(storage)?.snbt).toBe('{list: [0, 1, 2, 3], obj: {a: 1}}');
        });

        it('copies from another storage: the whole compound, or every tag a path names', () => {
            const data = serverCommandHost(fixture.server).data;
            const source = { kind: 'storage', id: 'mypack:source' } as const;
            data.mergeData(source, '{items: [{id: "a"}, {id: "b"}], n: 5}');

            expect(data.modifyData(storage, 'copy', 'set', { kind: 'from', target: source })).toBe(1);
            expect(
                data.modifyData(storage, 'ids', 'append', { kind: 'from', target: source, path: 'items[].id' })
            ).toBe(1);
            // `set` takes the last of several, as Java does.
            expect(data.modifyData(storage, 'last', 'set', { kind: 'from', target: source, path: 'items[].id' })).toBe(
                1
            );

            expect(data.getData(storage, 'copy.n')?.result).toBe(5);
            expect(data.getData(storage, 'ids')?.snbt).toBe('["a", "b"]');
            expect(data.getData(storage, 'last')?.snbt).toBe('"b"');
            expect(() =>
                data.modifyData(storage, 'x', 'set', { kind: 'from', target: source, path: 'missing' })
            ).toThrow('Found no elements matching missing');
        });

        it('removes every tag a path names and counts them', () => {
            const data = serverCommandHost(fixture.server).data;
            data.mergeData(storage, '{list: [1, 2, 3], keep: 1}');

            expect(data.removeData(storage, 'list[]')).toBe(3);
            expect(data.removeData(storage, 'list[]')).toBe(0);
            expect(data.getData(storage)?.snbt).toBe('{keep: 1, list: []}');
        });

        it('turns the errors bad input causes into refusals with their message', () => {
            const data = serverCommandHost(fixture.server).data;

            expect(() => data.mergeData(storage, '{a: ')).toThrow(CommandSyntaxException);
            expect(() => data.countData(storage, 'a[')).toThrow(CommandSyntaxException);
            expect(() => data.getData({ kind: 'storage', id: 'Bad Id' })).toThrow('Invalid storage id Bad Id');
            expect(() => data.modifyData(storage, 'a', 'merge', value('1'))).toThrow('Expected object, got: 1');
        });

        it('keeps what the commands write in the level, under the id with its namespace', async () => {
            await expect(fixture.run('data merge storage state {a: 1}')).resolves.toBe(1);
            await expect(fixture.run('data modify storage minecraft:state b set value 2b')).resolves.toBe(1);
            await expect(fixture.run('data get storage state b')).resolves.toBe(2);

            expect(fixture.feedback.at(-1)).toBe('Storage state has the following contents: 2b');
            const saved = fixture.server.getWorldManager().getEntryLevel().getCommandStorage().get('state');
            expect(formatSnbt(saved)).toBe('{a: 1, b: 2b}');
        });

        it('stores a typed value from execute store, then reads it back as that type', async () => {
            await fixture.run('execute store result storage mypack:out n short 0.5 run data get storage mypack:x');
            await fixture.run('data get storage mypack:out n');

            expect(fixture.feedback.at(-1)).toBe('Storage mypack:out has the following contents: 0s');
        });

        it('stores a float that overflows as an infinite float', async () => {
            const huge = `1${'0'.repeat(39)}`;
            await fixture.run('data merge storage mypack:x {v: 2147483647}');
            await fixture.run(
                `execute store result storage mypack:out up float ${huge} run data get storage mypack:x v`
            );
            await fixture.run(
                `execute store result storage mypack:out down float -${huge} run data get storage mypack:x v`
            );

            const stored = fixture.server.getWorldManager().getEntryLevel().getCommandStorage().get('mypack:out');
            expect(stored.value.up).toEqual(floatTag(Number.POSITIVE_INFINITY));
            expect(stored.value.down).toEqual(floatTag(Number.NEGATIVE_INFINITY));
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

            await expect(fixture.run('replaceitem entity @a slot.hotbar 2 minecraft:stone 4')).resolves.toBe(1);
            expect(player.getInventory().container('inventory').get(2)?.getName()).toBe('minecraft:stone');
            expect(player.getInventory().container('inventory').get(2)?.getAmount()).toBe(4);
        });

        it('gives the stack /replaceitem writes the count its slot holds', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await fixture.run('replaceitem entity @a slot.hotbar 0 minecraft:stone 2');
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(2);
        });

        it('leaves an occupied slot alone in keep mode', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('replaceitem entity @a slot.hotbar 0 minecraft:stone 1');

            await expect(fixture.run('replaceitem entity @a slot.hotbar 0 keep minecraft:stone 9')).resolves.toBe(0);
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(1);
        });

        it('writes the ender chest, which is a container a player carries', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('replaceitem entity @a slot.enderchest 3 minecraft:stone 2')).resolves.toBe(1);
            expect(player.getInventory().container('ender_chest').get(3)?.getName()).toBe('minecraft:stone');
        });

        it('reads the indexed armor spelling as the named one', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('replaceitem entity @a slot.armor 1 minecraft:stone 1')).resolves.toBe(1);
            await expect(fixture.run('replaceitem entity @a slot.armor.legs 0 minecraft:stone 2')).resolves.toBe(1);

            // Index 1 is the chestplate and `slot.armor.legs` is index 2, so
            // the two spellings addressed different slots of one container.
            expect(player.getInventory().container('armor').get(1)?.getAmount()).toBe(1);
            expect(player.getInventory().container('armor').get(2)?.getAmount()).toBe(2);
        });

        it('refuses a slot group the target does not have, in a sentence', async () => {
            playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            // A player has no saddle; a mount does.
            await expect(fixture.run('replaceitem entity @a slot.saddle 0 minecraft:stone')).rejects.toThrow(
                'A player has no slot.saddle slots'
            );
            await expect(fixture.run('replaceitem entity @a slot.hotbar 9 minecraft:stone')).rejects.toThrow(
                'Could not replace slot 9, must be a value between 0 and 8.'
            );
        });

        it("writes Java's container.0 into hotbar slot 0, not the first slot past it", async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('item replace entity @a container.0 with minecraft:stone 3')).resolves.toBe(1);
            await expect(fixture.run('item replace entity @a inventory.0 with minecraft:stone 7')).resolves.toBe(1);

            const main = player.getInventory().container('inventory');
            expect(main.get(0)?.getAmount()).toBe(3);
            expect(main.get(9)?.getAmount()).toBe(7);
        });

        it('writes a player ender chest slot through /item', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));

            await expect(fixture.run('item replace entity @a enderchest.4 with minecraft:stone')).resolves.toBe(1);
            expect(player.getInventory().container('ender_chest').get(4)?.getName()).toBe('minecraft:stone');
        });

        it('spreads one stack over a wildcard as replace, fill and override each do', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            const main = player.getInventory().container('inventory');
            const counts = () =>
                main
                    .items()
                    .slice(0, 9)
                    .map((stack) => stack?.getAmount() ?? 0);

            // `replace` writes the first slot the name covers and leaves the rest.
            await expect(fixture.run('item replace entity @a hotbar.* with minecraft:stone 1')).resolves.toBe(1);
            expect(counts()).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);

            // `fill` writes every one of them.
            await expect(fixture.run('item fill entity @a hotbar.* with minecraft:stone 2')).resolves.toBe(9);
            expect(counts()).toEqual(Array(9).fill(2));

            // `override` writes the first and empties the rest.
            await expect(fixture.run('item override entity @a hotbar.* with minecraft:stone 3')).resolves.toBe(9);
            expect(counts()).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
        });

        it('copies one slot to another through /item replace … from, an empty one included', async () => {
            const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            await fixture.run('item replace entity @a hotbar.0 with minecraft:stone 5');

            await expect(fixture.run('item replace entity @a armor.head from entity @a hotbar.0')).resolves.toBe(1);
            expect(player.getInventory().container('armor').get(0)?.getAmount()).toBe(5);
            // A copy, not the same stack in two slots.
            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(5);

            await fixture.run('item replace entity @a armor.head from entity @a hotbar.1');
            expect(player.getInventory().container('armor').get(0)).toBeNull();
        });

        describe('item modifiers', () => {
            /**
             * A content build whose datapack declares the item modifiers `mypack:sharpen` and
             * `mypack:triple`, and the item tag `mypack:blades`.
             */
            const modifierContent = (): ServerContent => {
                const definitions = definitionsOf({
                    slotSources: new Map([
                        [
                            'mypack:hotbar_stone',
                            definitionOf('slotSources', 'mypack:hotbar_stone', {
                                type: 'minecraft:filtered',
                                slot_source: { type: 'minecraft:slot_range', slots: 'hotbar.*' },
                                item_filter: { items: 'minecraft:stone' }
                            })
                        ]
                    ]),
                    tags: new Map([
                        [
                            'item/mypack:blades',
                            definitionOf('tags', 'item/mypack:blades', { values: ['minecraft:diamond_sword'] })
                        ]
                    ]),
                    itemModifiers: new Map([
                        [
                            'mypack:sharpen',
                            definitionOf('itemModifiers', 'mypack:sharpen', [
                                { type: 'minecraft:set_name', name: 'Sharp' },
                                { type: 'minecraft:set_count', count: 1 }
                            ])
                        ],
                        [
                            'mypack:triple',
                            definitionOf('itemModifiers', 'mypack:triple', {
                                type: 'minecraft:set_count',
                                count: 3
                            })
                        ]
                    ])
                });
                return stub<ServerContent>({
                    definitions,
                    blocks: stub<ServerContent['blocks']>({ types: new Map<string, BlockType>() }),
                    items: stub<ServerContent['items']>({ types: vanillaItemTypes() }),
                    loot: new LootRegistry(
                        { ...definitions, lootTables: javaLootTables(definitions.lootTablesJava) },
                        { worldSeed: 1n }
                    )
                });
            };

            it('runs a modifier over the held stack and keeps what it did not touch', async () => {
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());
                player.getInventory().setEquipment(
                    'mainhand',
                    itemOfDrop({
                        identifier: 'minecraft:diamond_sword',
                        count: 1,
                        lore: ['Old'],
                        enchantments: { 'minecraft:sharpness': 2 }
                    })
                );

                await expect(fixture.run('item modify entity @a weapon.mainhand mypack:sharpen')).resolves.toBe(1);

                const held = player.getInventory().equipment('mainhand');
                expect(held?.getName()).toBe('minecraft:diamond_sword');
                expect(held?.getEnchantmentLevel('minecraft:sharpness')).toBe(2);
                expect(held?.getCustomName()).toBe('Sharp');
                expect(held?.getLore()).toEqual(['Old']);
                expect(held?.durability).toBe(held?.getMaxDurability());
            });

            it("keeps the Bedrock fields of a container's stacks through a modifier", async () => {
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());
                player.getInventory().setEquipment(
                    'mainhand',
                    itemOfDrop({
                        identifier: 'minecraft:shulker_box',
                        count: 1,
                        canPlaceOn: ['minecraft:stone'],
                        contents: [{ identifier: 'minecraft:stone', count: 3, canDestroy: ['minecraft:dirt'] }]
                    })
                );

                await expect(fixture.run('item modify entity @a weapon.mainhand mypack:sharpen')).resolves.toBe(1);

                const held = player.getInventory().equipment('mainhand');
                expect(held?.getCustomName()).toBe('Sharp');
                expect(held?.getCanPlaceOnBlocks()).toEqual(['minecraft:stone']);
                const [inside] = held?.getContents() ?? [];
                expect(inside?.getAmount()).toBe(3);
                expect(inside?.getCanDestroyBlocks()).toEqual(['minecraft:dirt']);
            });

            it('runs a modifier over each stack /item … from copies', async () => {
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());
                await fixture.run('item replace entity @a hotbar.0 with minecraft:stone 1');

                await expect(
                    fixture.run('item replace entity @a hotbar.1 from entity @a hotbar.0 mypack:triple')
                ).resolves.toBe(1);

                const inventory = player.getInventory().container('inventory');
                expect(inventory.get(1)?.getAmount()).toBe(3);
                expect(inventory.get(0)?.getAmount()).toBe(1);
            });

            it('leaves an empty slot alone', async () => {
                playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());

                await expect(fixture.run('item modify entity @a weapon.mainhand mypack:triple')).resolves.toBe(0);
            });

            it('counts the matching items in the slots execute if items names', async () => {
                const player = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());
                await fixture.run('item replace entity @a hotbar.1 with minecraft:stone 5');
                await fixture.run('item replace entity @a hotbar.2 with minecraft:stone 2');
                player
                    .getInventory()
                    .setEquipment(
                        'mainhand',
                        itemOfDrop({ identifier: 'minecraft:diamond_sword', count: 1, customName: 'Edge' })
                    );

                await expect(fixture.run('execute if items entity @a hotbar.* minecraft:stone')).resolves.toBe(7);
                await expect(fixture.run('execute if items entity @a hotbar.1 stone')).resolves.toBe(5);
                await expect(fixture.run('execute if items entity @a hotbar.* minecraft:dirt')).resolves.toBe(0);
                await expect(fixture.run('execute unless items entity @a hotbar.* minecraft:dirt')).resolves.toBe(1);
                await expect(fixture.run('execute if items entity @a weapon.mainhand #mypack:blades')).resolves.toBe(1);
                await expect(fixture.run('execute if items entity @a weapon.mainhand *[custom_name]')).resolves.toBe(1);
                await expect(
                    fixture.run('execute if items entity @a weapon.mainhand *[custom_name="Edge"]')
                ).resolves.toBe(1);
                await expect(
                    fixture.run('execute if items entity @a weapon.mainhand *[!custom_name|custom_name="Dull"]')
                ).resolves.toBe(0);
                await expect(fixture.run('execute if items entity @a weapon.mainhand * run say yes')).resolves.toBe(1);
            });

            it('counts the slots a slot source selects, as execute if slots and if items read it', async () => {
                playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());
                await fixture.run('item replace entity @a hotbar.1 with minecraft:stone 5');
                await fixture.run('item replace entity @a hotbar.2 with minecraft:dirt 2');

                // A slot name is a range, which selects empty slots too, as Java's does.
                await expect(fixture.run('execute if slots entity @a hotbar.*')).resolves.toBe(9);
                await expect(fixture.run('execute if slots entity @a mypack:hotbar_stone')).resolves.toBe(1);
                // Inside a source a string is an id, so each range is written out.
                await expect(
                    fixture.run(
                        'execute if slots entity @a {type: "limit_slots", limit: 2, slot_source: [{type: "slot_range", slots: "hotbar.*"}, {type: "slot_range", slots: "armor.*"}]}'
                    )
                ).resolves.toBe(2);
                await expect(fixture.run('execute if slots entity @a {type: "empty"}')).resolves.toBe(0);
                await expect(fixture.run('execute unless slots entity @a {type: "empty"}')).resolves.toBe(1);
                await expect(fixture.run('execute if items entity @a mypack:hotbar_stone *')).resolves.toBe(5);
                await expect(fixture.run('execute if slots entity @a mypack:nothing')).rejects.toThrow(
                    'Unknown slot source: mypack:nothing'
                );
            });

            it('refuses a modifier no datapack declares', async () => {
                playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
                fixture.useContent(modifierContent());

                await expect(fixture.run('item modify entity @a weapon.mainhand mypack:nothing')).rejects.toThrow(
                    'Unknown item modifier: mypack:nothing'
                );
            });
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
            expect(packet.getPacketData()?.animation).toBe('animation.pig.baby_transform');
            expect(packet.getPacketData()?.runtimeIds).toEqual([1n, 2n]);
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
                // Each fixture's level has its own board, so this one is as
                // empty as a server where nobody ran `/scoreboard objectives add`.
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

        /** A client in the level, whose packets the scoreboard's changes go to. */
        const watch = () => {
            fixture.players.push(
                stub<PlayerSession>({
                    getWorld: () => fixture.world,
                    presenter: new BedrockPresenter({
                        sendDataPacket: async (packet) => {
                            fixture.sent.push(packet);
                        }
                    }),
                    released: () => {}
                })
            );
        };

        it('draws a slot and tells the clients in the level about every line in it', async () => {
            watch();
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
            watch();
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
            expect([...fixture.players[0]!.getActor()!.getTags()]).toEqual(['veteran']);
            expect([...fixture.players[1]!.getActor()!.getTags()]).toEqual([]);
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
                .setEquipment('mainhand', new ItemStack({ name: 'minecraft:diamond_sword' }).withCount(1));

            await expect(fixture.run('enchant @a sharpness 3')).resolves.toBe(1);

            expect(player.getInventory().equipment('mainhand')?.getEnchantmentLevel('minecraft:sharpness')).toBe(3);
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

            expect(player.getInventory().container('inventory').get(0)?.getAmount()).toBe(2);
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
            return stub<ServerContent>({ recipes: loaded.book, advancements: new AdvancementEngine() });
        };

        /** A player whose book was loaded at join, as `PlayerSession.join` does. */
        let steve: PlayerSession | undefined;
        const joined = (fixture: Fixture): PlayerSession => {
            steve = playerAt(fixture, 1n, 'Steve', new Vector3(0, 64, 0));
            loadRecipeBook(steve.keyed(), [], steve.presenter);
            return steve;
        };
        const lastBookPacket = (fixture: Fixture) =>
            fixture.sent
                .filter((entry) => entry instanceof UnlockedRecipesPacket)
                .at(-1)
                ?.getPacketData();

        afterEach(() => {
            if (steve !== undefined) forgetRecipeBook(steve.keyed());
        });

        it('names a recipe the book does not hold', async () => {
            joined(fixture);
            fixture.useContent(recipeContent());

            await expect(fixture.run('recipe give @a mypack:nothing')).rejects.toThrow(
                /Unknown recipe: mypack:nothing/
            );
        });

        it('tells the client which recipe it just unlocked, and counts recipes', async () => {
            const session = joined(fixture);
            fixture.useContent(recipeContent());

            await expect(fixture.run('recipe give @a mypack:cake')).resolves.toBe(1);

            expect(lastBookPacket(fixture)?.type).toBe(UnlockedRecipesType.NEWLY_UNLOCKED_RECIPES);
            expect(lastBookPacket(fixture)?.recipes).toEqual(['mypack:cake']);
            expect(recipeBookOf(session.keyed())).toEqual(['mypack:cake']);
        });

        it('changes nothing when the player already had it', async () => {
            joined(fixture);
            fixture.useContent(recipeContent());

            await fixture.run('recipe give @a mypack:cake');
            await expect(fixture.run('recipe give @a mypack:cake')).resolves.toBe(0);
        });

        it('unlocks every recipe the player lacks for a star, and locks them again', async () => {
            joined(fixture);
            fixture.useContent(recipeContent());

            await fixture.run('recipe give @a mypack:cake');
            await expect(fixture.run('recipe give @a *')).resolves.toBe(1);
            expect(lastBookPacket(fixture)?.recipes).toEqual(['mypack:torch']);

            await expect(fixture.run('recipe take @a *')).resolves.toBe(2);
            expect(lastBookPacket(fixture)?.type).toBe(UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES);
            expect(lastBookPacket(fixture)?.recipes).toEqual(['mypack:cake', 'mypack:torch']);
        });

        it('locks one recipe without touching the rest', async () => {
            const session = joined(fixture);
            fixture.useContent(recipeContent());

            await fixture.run('recipe give @a *');
            await expect(fixture.run('recipe take @a mypack:cake')).resolves.toBe(1);

            expect(lastBookPacket(fixture)?.type).toBe(UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES);
            expect(lastBookPacket(fixture)?.recipes).toEqual(['mypack:cake']);
            expect(recipeBookOf(session.keyed())).toEqual(['mypack:torch']);
        });
    });
});
