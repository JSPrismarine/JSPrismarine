import GameruleManager, { GameRules } from './GameruleManager';

import minifyJson from 'strip-json-comments';
import type Player from '../Player';
import type Server from '../Server';
import type { Block } from '../block/Block';
import { BlockMappings } from '../block/BlockMappings';
import * as Entities from '../entity/Entities';
import type { Entity } from '../entity/Entity';
import { Item } from '../item/Item';
import Vector3 from '../math/Vector3';
import LevelSoundEventPacket from '../network/packet/LevelSoundEventPacket';
import UpdateBlockPacket from '../network/packet/UpdateBlockPacket';
import WorldEventPacket from '../network/packet/WorldEventPacket';
import Timer from '../utils/Timer';
import UUID from '../utils/UUID';
import { cwd } from '../utils/cwd';
import { Gamemode } from './';
import type { Generator } from './Generator';
import Chunk from './chunk/Chunk';
import type BaseProvider from './providers/BaseProvider';

import fs from 'node:fs';
import path from 'node:path';

export interface WorldData {
    name: string;
    path: string;
    server: Server;
    provider: any;
    seed: number;
    generator: Generator;
    config?: any;
}

export interface LevelMeta {
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
    };
    inventory: Array<{
        id: string;
        numeric_id: number;
        numeric_meta: number;
        count: number;
        position: number;
    }>;
}

export class World {
    private readonly uuid: string = UUID.randomString();
    private name: string;
    private path: string;

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

    public constructor({ name, server, path: levelPath, provider, seed, generator, config }: WorldData) {
        this.name = name;
        this.path = levelPath;
        this.server = server;
        this.provider = provider;
        this.gameruleManager = new GameruleManager(server);
        this.seed = seed;
        this.generator = generator;
        this.config = config ?? {};

        this.gameruleManager.setGamerule(GameRules.ShowCoordinates, true, true);

        // Create player data folder
        if (!fs.existsSync(path.join(cwd(), 'worlds', name, '/playerdata'))) {
            fs.mkdirSync(path.join(cwd(), 'worlds', name, '/playerdata'));
        }
    }

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
                        server: this.server,
                        uuid: entityData.uuid
                    })
                );
            }
        }

        this.provider.setWorld(this);
        await this.provider.enable();

        this.server
            .getLogger()
            .info(`Preparing start region for dimension §b'${this.name}'/${this.generator.constructor.name}§r`);
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

    public async disable() {
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
        if (this.currentTick / 20 === 2 * 60) {
            await this.save();
        }

        for (const entity of this.getEntities()) {
            await entity.update(tick);
        }
    }

    /**
     * Returns a block instance in the given world position.
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param layer - block storage layer (0 for blocks, 1 for liquids)
     */
    public async getBlock(bx: number, by: number, bz: number, layer = 0): Promise<Block> {
        const blockId = (await this.getChunkAt(bx, bz)).getBlock(bx, by, bz, layer);
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
     *
     * @param cx
     * @param cz
     */
    public async loadChunk(cx: number, cz: number, _ignoreWarn?: boolean): Promise<Chunk> {
        const index = Chunk.packXZ(cx, cz);
        // Try - catch for provider errors
        const chunk = await this.provider.readChunk(cx, cz, this.seed, this.generator, this.config);
        this.chunks.set(index, chunk);

        // TODO: event here, eg onChunkLoad
        return chunk;
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     *
     * @param position - world position
     * @param worldEvent - event identifier
     * @param data
     */
    public sendWorldEvent(position: Vector3 | null, worldEvent: number, data: number): void {
        const worldEventPacket = new WorldEventPacket();
        worldEventPacket.eventId = worldEvent;
        worldEventPacket.data = data;
        if (position !== null) {
            // TODO: this.getChunkAt(position.getX(), position.getZ()).
            // Save player into the chunk directly
        } else {
            // To all players
        }
    }

    /**
     * Returns a chunk from a block position's x and z coordinates.
     */
    public async getChunkAt(bx: number, bz: number): Promise<Chunk> {
        return this.getChunk(bx >> 4, bz >> 4);
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
     *
     * @param pos - The position as a `Vector3`.
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
        const blockId = (await this.getChunkAt(blockPosition.getX(), blockPosition.getZ())).getBlock(
            blockPosition.getX(),
            blockPosition.getY(),
            blockPosition.getZ()
        );

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
            blockUpdate.blockRuntimeId = 0; // TODO: get previous block
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

        pk.positionX = player.getX();
        pk.positionY = player.getY();
        pk.positionZ = player.getZ();

        pk.extraData = runtimeId; // In this case refers to block runtime Id
        pk.entityType = ':';
        pk.isBabyMob = false;
        pk.disableRelativeVolume = false;

        await Promise.all(
            player
                .getPlayersInChunk()
                .map(async (narbyPlayer) => narbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk))
        );
    }

    public async sendTime(): Promise<void> {
        // Try to send it at the same time to all
        await Promise.all(
            this.getEntities()
                .filter((e) => e.isPlayer())
                .map(async (player) => (player as Player).getNetworkSession().sendTime(this.getTicks()))
        );
    }

    /**
     * Adds an entity to the level.
     */
    public async addEntity(entity: Entity): Promise<void> {
        if (!entity.isPlayer()) await entity.sendSpawn();

        this.entities.set(entity.getRuntimeId(), entity);
        // const chunk = await this.getChunkAt(entity.getX(), entity.getZ(), true);
        // chunk.addEntity(entity as any);
    }

    /**
     * Removes an entity from the level.
     */
    public async removeEntity(entity: Entity): Promise<void> {
        if (!entity.isPlayer()) await entity.sendDespawn();

        this.entities.delete(entity.getRuntimeId());
    }

    /**
     * Returns all entities (including players)
     *
     * You can filter this by either using the entity.getType() or
     * entity.isPlayer() functions.
     */
    public getEntities(): Entity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Saves changed chunks into disk.
     */
    public async saveChunks(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().info(`Saving chunks for level §b'${this.name}'/${this.generator.constructor.name}§r`);

        await Promise.all(
            Array.from(this.chunks.values())
                .filter((c) => c.getHasChanged())
                .map(async (chunk) => this.provider.writeChunk(chunk))
        );
        this.server.getLogger().verbose(`(took §e${timer.stop()} ms§r)!`);
    }

    public async save(): Promise<void> {
        // Save chunks
        this.server
            .getSessionManager()
            .getAllPlayers()
            .forEach(async (player) => {
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

    public getSeed(): number {
        return this.seed;
    }

    private async getLevelData() {
        try {
            const raw = fs.promises.readFile(path.resolve(this.path, 'level.json'), 'utf-8');
            return JSON.parse(minifyJson(raw.toString())) as Partial<LevelMeta>;
        } catch {
            this.server.getLogger().warn(`Failed to read level data`);
            return {};
        }
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
                        z: entity.getZ()
                    }
                }))
        };

        try {
            await fs.promises.writeFile(path.resolve(this.path, 'level.json'), JSON.stringify(data, null, 4));
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level data`);
            this.server.getLogger().error(error);
        }
    }

    public async getPlayerData(player: Player): Promise<WorldPlayerData> {
        try {
            const raw = fs.readFileSync(path.resolve(this.path, 'playerdata', `${player.getXUID()}.json`, 'utf-8'));
            return JSON.parse(minifyJson(raw.toString())) as WorldPlayerData;
        } catch {
            this.server
                .getLogger()
                .debug(`PlayerData is missing for player ${player.getXUID()}`, 'World/getPlayerData');

            return {
                gamemode: this.server.getConfig().getGamemode(),
                position: {
                    x: (await this.getSpawnPosition()).getX(),
                    y: (await this.getSpawnPosition()).getY(),
                    z: (await this.getSpawnPosition()).getZ(),
                    pitch: 0,
                    yaw: 0
                },
                inventory: []
            };
        }
    }

    public async savePlayerData(player: Player): Promise<void> {
        const data = {
            uuid: player.getUUID(),
            username: player.getName(),
            gamemode: Gamemode.getGamemodeName(player.gamemode).toLowerCase(),
            position: {
                x: player.getX(),
                y: player.getY(),
                z: player.getZ(),
                pitch: player.pitch,
                yaw: player.yaw
            },
            inventory: player
                .getInventory()
                .getItems(true)
                .map((entry, index) => {
                    const item = entry.getItem();
                    const count = entry.getCount();

                    return {
                        id: item.getName(),
                        numeric_id: item.getId(),
                        numeric_meta: item.meta,
                        count,
                        position: index
                    };
                })
                .filter((a) => (a as any)?.numeric_id > 0)
        } as WorldPlayerData;

        try {
            fs.writeFileSync(
                path.resolve(this.path, 'playerdata', `${player.getXUID()}.json`),
                JSON.stringify(data, null, 4)
            );
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save player data`);
            this.server.getLogger().error(error);
        }
    }
}
