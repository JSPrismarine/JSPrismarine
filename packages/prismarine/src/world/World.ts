import GameruleManager, { GameRules } from './GameruleManager';

import fs from 'node:fs';

import minifyJson from 'strip-json-comments';

import { Vector3 } from '@jsprismarine/math';
import { getGametypeName } from '@jsprismarine/minecraft';
import type { Block, Player, Server, Service } from '../';
import { Timer, UUID } from '../';
import { BlockMappings } from '../block/BlockMappings';
import * as Entities from '../entity/Entities';
import type { Entity } from '../entity/Entity';
import { Item } from '../item/Item';
import LevelSoundEventPacket from '../network/packet/LevelSoundEventPacket';
import UpdateBlockPacket from '../network/packet/UpdateBlockPacket';
import type { WorldEvent } from '../network/packet/WorldEventPacket';
import WorldEventPacket from '../network/packet/WorldEventPacket';
import { withCwd } from '../utils/cwd';
import type { Generator } from './Generator';
import Chunk from './chunk/Chunk';
import type BaseProvider from './providers/BaseProvider';

const LEVEL_DATA_FILE_NAME = 'level.json';
const WORLDS_FOLDER_NAME = 'worlds';

export interface WorldData {
    name: string;
    path: string;
    server: Server;
    provider: BaseProvider;
    seed: number;
    generator: Generator;
    config?: any;
}

export interface LevelData {
    spawn: { x: number; y: number; z: number } | undefined;
    gameRules: Array<[string, any]>;
    entities: Array<{
        uuid: string;
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
    }>;
}
export interface WorldPlayerData {
    gamemode: string;
    position: {
        x: number;
        y: number;
        z: number;
        pitch: number;
        yaw: number;
        headYaw: number;
    };
}

export class World implements Service {
    private readonly uuid: string = UUID.randomString();
    private name: string;

    private readonly entities: Map<bigint, Entity> = new Map();
    private readonly chunks: Map<bigint, Chunk> = new Map();
    private readonly gameruleManager: GameruleManager;
    private currentTick = 0;
    private readonly provider: BaseProvider;
    private readonly server: Server;
    private readonly seed: number;
    private readonly generator: Generator;
    private readonly config: Object;
    private spawn: Vector3 | null = null;

    public constructor({ name, server, provider, seed, generator, config }: WorldData) {
        this.name = name;
        this.server = server;
        this.provider = provider;
        this.gameruleManager = new GameruleManager(server);
        this.seed = seed;
        this.generator = generator;
        this.config = config ?? {};

        this.gameruleManager.setGamerule(GameRules.ShowCoordinates, true, true);

        try {
            // Create folders if they don't exist.
            const path = withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata');
            if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to create world folders for ${this.name}`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.server.on('tick', async (evt) => this.update(evt.getTick()));

        const level = await this.getLevelData();
        if (level.spawn) this.setSpawnPosition(Vector3.fromObject(level.spawn));
        if (level.gameRules) {
            level.gameRules.forEach(([name, [value, editable]]) =>
                this.gameruleManager.setGamerule(name, value, editable)
            );
        }
        if (level.entities) {
            for (const entityData of level.entities) {
                const Entity = Array.from(Object.values(Entities)).find((e) => e.MOB_ID === entityData.type);
                if (!Entity) {
                    this.server.getLogger().warn(`Entity type ${entityData.type} not found`);
                    continue;
                }

                await this.addEntity(
                    new Entity({
                        world: this,
                        uuid: entityData.uuid,
                        ...entityData.position,
                        server: this.server
                    })
                );
            }
        }

        this.provider.setWorld(this);
        await this.provider.enable();

        this.server.getLogger().info(`Preparing start region for dimension ${this.getFormattedName()}`);
        const chunksToLoad: Array<Promise<Chunk>> = [];
        const timer = new Timer();

        const size = this.server.getConfig().getViewDistance() * 5;
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                chunksToLoad.push(this.loadChunk(x, z, true));
            }
        }

        await Promise.all(chunksToLoad);
        this.server.getLogger().verbose(`(took §e${timer.stop()} ms§r)`);
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        await this.save();
        await this.provider.disable();
    }

    public getGenerator(): Generator {
        return this.generator;
    }

    /**
     * Called every tick.
     *
     * @param tick
     */
    public async update(tick: number): Promise<void> {
        // TODO: tick chunks

        // Continue world time ticks
        this.currentTick++;

        // Auto save every 2 minutes
        if (this.currentTick / 20 === 120) {
            await this.save();
        }

        await Promise.all(this.getEntities().map((entity) => entity.update(tick)));
        await this.sendTime();
    }

    /**
     * Returns a block instance in the given world position.
     * @param {number} x - block x
     * @param {number} y - block y
     * @param {number} z - block z
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids)
     */
    public async getBlock(x: number, y: number, z: number, layer = 0): Promise<Block> {
        const blockId = (await this.getChunkAt(x, z)).getBlock(x, y, z, layer);
        const block = this.server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta);

        if (!block) return this.server.getBlockManager().getBlock('minecraft:air');
        return block;
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     */
    public async getChunk(cx: number, cz: number): Promise<Chunk> {
        const index = Chunk.packXZ(cx, cz);
        if (!this.chunks.has(index)) return this.loadChunk(cx, cz);

        return this.chunks.get(index)!;
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     * @param {number} x - x coordinate.
     * @param {number} z - z coordinate.
     */
    public async loadChunk(x: number, z: number, _ignoreWarn?: boolean): Promise<Chunk> {
        const index = Chunk.packXZ(x, z);
        // Try - catch for provider errors
        const chunk = await this.provider.readChunk(x, z, this.seed, this.generator, this.config);
        this.chunks.set(index, chunk);

        // TODO: event here, eg onChunkLoad
        return chunk;
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     * @param {Vector3} position - world position.
     * @param {number} event - event identifier.
     * @param {number} data - event data.
     */
    public async sendWorldEvent(position: Vector3 | null, event: WorldEvent, data: number): Promise<void> {
        const worldEventPacket = new WorldEventPacket();
        worldEventPacket.eventId = event;
        //worldEventPacket.position = position;
        worldEventPacket.data = data;

        // TODO: Limit distance.
        await Promise.all(this.getPlayers().map((player) => player.getNetworkSession().send(worldEventPacket)));
    }

    /**
     * Returns a chunk from a block position's x and z coordinates.
     */
    public async getChunkAt(x: Vector3): Promise<Chunk>;
    public async getChunkAt(x: number, z: number): Promise<Chunk>;
    public async getChunkAt(x: Vector3 | number, z: number = 0): Promise<Chunk> {
        if (x instanceof Vector3) {
            return this.getChunkAt(x.getX(), x.getZ());
        }

        return this.getChunk(x >> 4, z >> 4);
    }

    /**
     * Returns the world default spawn position.
     */
    public async getSpawnPosition(): Promise<Vector3> {
        if (this.spawn) return this.spawn;

        const x = 0;
        const z = 0; // TODO: replace with actual data
        const chunk = await this.getChunkAt(x, z);
        const y = chunk.getHighestBlockAt(x, z) + 1;
        return new Vector3(z, y + 2, z);
    }

    /**
     * Set the world's spawn position.
     * @param {Vector3} pos - The position.
     */
    public setSpawnPosition(pos: Vector3) {
        this.spawn = pos;
    }

    // TODO: move this?
    public async useItemOn(
        itemInHand: Item | Block | null,
        blockPosition: Vector3,
        face: number,
        clickPosition: Vector3,
        player: Player
    ): Promise<void> {
        if (itemInHand instanceof Item) return; // TODO

        // TODO: checks
        // TODO: canInteract

        const block = itemInHand; // TODO: get block from itemInHand
        const blockId = (await this.getChunkAt(blockPosition)).getBlock(blockPosition);

        const clickedBlock = this.server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta);

        if (!block || !clickedBlock) return;
        if (clickedBlock.getName() === 'minecraft:air' || !block.canBePlaced()) return;

        const placedPosition = new Vector3(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());

        // Only set correct face if the block can't be replaced
        if (!clickedBlock.canBeReplaced())
            switch (face) {
                case 0: // Bottom
                    placedPosition.setY(placedPosition.getY() - 1);
                    break;
                case 1: // Top
                    placedPosition.setY(placedPosition.getY() + 1);
                    break;
                case 2: // Front
                    placedPosition.setZ(placedPosition.getZ() - 1);
                    break;
                case 3: // Back
                    placedPosition.setZ(placedPosition.getZ() + 1);
                    break;
                case 4: // Right
                    placedPosition.setX(placedPosition.getX() - 1);
                    break;
                case 5: // Left
                    placedPosition.setX(placedPosition.getX() + 1);
                    break;
                default:
                    throw new Error('Invalid Face');
            }

        if (blockPosition.getY() < 0 || blockPosition.getY() > 255) return;

        const success: boolean = await new Promise(async (resolve) => {
            try {
                const chunk = await this.getChunkAt(placedPosition.getX(), placedPosition.getZ());

                chunk.setBlock(placedPosition.getX(), placedPosition.getY(), placedPosition.getZ(), block);
                resolve(true);
            } catch (error: unknown) {
                player.getServer().getLogger().warn(`${player.getName()} failed to place block due to ${error}`);
                await player.sendMessage((error as any)?.message);

                resolve(false);
            }
        });

        if (!success) {
            if (placedPosition.getY() < 0) return;

            const blockUpdate = new UpdateBlockPacket();
            blockUpdate.x = placedPosition.getX();
            blockUpdate.y = placedPosition.getY();
            blockUpdate.z = placedPosition.getZ();
            blockUpdate.blockRuntimeId = BlockMappings.getRuntimeId(clickedBlock.getName());
            return;
        }

        const runtimeId = BlockMappings.getRuntimeId(block.getName());

        const blockUpdate = new UpdateBlockPacket();
        blockUpdate.x = placedPosition.getX();
        blockUpdate.y = placedPosition.getY();
        blockUpdate.z = placedPosition.getZ();
        blockUpdate.blockRuntimeId = runtimeId;

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .map(async (onlinePlayer) =>
                    onlinePlayer.getNetworkSession().getConnection().sendDataPacket(blockUpdate)
                )
        );

        const pk = new LevelSoundEventPacket();
        pk.sound = 6; // TODO: enum

        pk.positionX = placedPosition.getX();
        pk.positionY = placedPosition.getY();
        pk.positionZ = placedPosition.getZ();

        pk.extraData = runtimeId; // In this case refers to block runtime Id
        pk.disableRelativeVolume = false;

        await Promise.all(
            player
                .getWorld()
                .getPlayers()
                .map((target) => target.getNetworkSession().send(pk))
        );
    }

    /**
     * Sends the current time to all players in the world.
     */
    public async sendTime(): Promise<void> {
        // Try to send it at the same time to all
        await Promise.all(this.getPlayers().map((player) => player.getNetworkSession().sendTime(this.getTicks())));
    }

    /**
     * Adds an entity to the level.
     * @param {Entity} entity - The entity to add.
     */
    public async addEntity(entity: Entity): Promise<void> {
        if (!entity.isPlayer()) await entity.sendSpawn();
        else await Promise.all(this.getEntities().map((e) => e.sendSpawn(entity as Player)));

        this.entities.set(entity.getRuntimeId(), entity);
    }

    /**
     * Removes an entity from the level.
     * @param {Entity} entity - The entity to remove.
     */
    public async removeEntity(entity: Entity): Promise<void> {
        if (!entity.isPlayer()) await entity.sendDespawn();
        else await Promise.all(this.getEntities().map((e) => e.sendDespawn(entity as Player)));

        this.entities.delete(entity.getRuntimeId());
    }

    /**
     * Get all entities in this world.
     * @returns {Entity[]} the entities.
     */
    public getEntities(): Entity[] {
        return Array.from(this.entities.values());
    }
    /**
     * Get all players in this world.
     * @returns {Player[]} the players.
     */
    public getPlayers(): Player[] {
        return (this.getEntities().filter((e) => e.isPlayer()) as Player[]).filter((p) => p.isOnline());
    }

    /**
     * Saves changed chunks into disk.
     */
    public async saveChunks(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().info(`Saving chunks for level ${this.getFormattedName()}`);

        await Promise.all(
            Array.from(this.chunks.values())
                .filter((c) => c.getHasChanged())
                .map(async (chunk) => this.provider.writeChunk(chunk))
        );
        this.server.getLogger().verbose(`(took §e${timer.stop()} ms§r)!`);
    }

    public async save(): Promise<void> {
        // Save chunks
        this.getPlayers().forEach(async (player) => {
            await this.savePlayerData(player);
        });
        await this.saveChunks();
        await this.saveLevelData();
    }

    public getGameruleManager(): GameruleManager {
        return this.gameruleManager;
    }

    public getTicks(): number {
        return this.currentTick;
    }

    public setTicks(tick: number): void {
        this.currentTick = tick;
    }

    public getProvider(): any {
        return this.provider;
    }

    // This is used for example in start game packet
    public getUUID(): string {
        return this.uuid;
    }

    public getName(): string {
        return this.name;
    }
    public getFormattedName(): string {
        return `§b'${this.name}'/${this.generator.constructor.name}§r`;
    }

    public getSeed(): number {
        return this.seed;
    }

    private async getLevelData() {
        const path = withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME);
        if (!fs.existsSync(path)) return {};

        try {
            const raw = await fs.promises.readFile(path, 'utf-8');
            return JSON.parse(minifyJson(raw.toString())) as Partial<LevelData>;
        } catch (error: any) {
            // Something went wrong while reading or parsing the level data.
            this.server.getLogger().error(error);
        }

        return {};
    }
    public async saveLevelData(): Promise<void> {
        const data = {
            spawn: await this.getSpawnPosition(),
            gamerules: Array.from(this.getGameruleManager().getGamerules()),
            entities: this.getEntities()
                .filter((entity) => !entity.isPlayer() && !entity.isConsole())
                .map((entity) => ({
                    uuid: entity.getUUID(),
                    type: entity.getType(),
                    position: {
                        x: entity.getX(),
                        y: entity.getY(),
                        z: entity.getZ(),
                        pitch: entity.pitch,
                        yaw: entity.yaw,
                        headYaw: entity.headYaw
                    }
                }))
        };

        try {
            await fs.promises.writeFile(
                withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME),
                JSON.stringify(data, null, 4)
            );
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level data`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * Get the player data for a player.
     * @param {Player} player - The player to get the data for.
     * @returns {Promise<WorldPlayerData>} The player data.
     */
    public async getPlayerData(player: Player): Promise<Partial<WorldPlayerData>> {
        try {
            const raw = await fs.promises.readFile(
                withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${player.getXUID() || player.getName()}.json`),
                { flag: 'r', encoding: 'utf-8' }
            );
            return JSON.parse(minifyJson(raw.toString())) as Partial<WorldPlayerData>;
        } catch (error: any) {
            this.server.getLogger().debug(`PlayerData is missing for player ${player.getXUID()}`);

            const spawn = await this.getSpawnPosition();
            return {
                gamemode: this.server.getConfig().getGamemode(),
                position: {
                    x: spawn.getX(),
                    y: spawn.getY(),
                    z: spawn.getZ(),
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0
                }
            };
        }
    }
    public async savePlayerData(player: Player): Promise<void> {
        const data = {
            uuid: player.getUUID(),
            username: player.getName(),
            gamemode: getGametypeName(player.gamemode),
            position: {
                x: player.getX(),
                y: player.getY(),
                z: player.getZ(),
                pitch: player.pitch,
                yaw: player.yaw,
                headYaw: player.headYaw
            }
        } as WorldPlayerData;

        try {
            await fs.promises.writeFile(
                withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${player.getXUID() || player.getName()}.json`),
                JSON.stringify(data, null, 4),
                { flag: 'w+', encoding: 'utf-8', flush: true }
            );
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save player data`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * @returns {Server} The server instance.
     */
    public getServer(): Server {
        return this.server;
    }
}
