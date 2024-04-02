import GameruleManager, { GameRules } from './GameruleManager';

import type BaseProvider from './providers/BaseProvider';
import type { Block } from '../block/Block';
import { BlockMappings } from '../block/BlockMappings';
import Chunk from './chunk/Chunk';
import type Entity from '../entity/Entity';
import Gamemode from './Gamemode';
import type Generator from './Generator';
import Item from '../item/Item';
import LevelSoundEventPacket from '../network/packet/LevelSoundEventPacket';
import type Player from '../Player';
import type Server from '../Server';
import Timer from '../utils/Timer';
import UUID from '../utils/UUID';
import UpdateBlockPacket from '../network/packet/UpdateBlockPacket';
import Vector3 from '../math/Vector3';
import WorldEventPacket from '../network/packet/WorldEventPacket';
import cwd from '../utils/cwd';
import fs from 'node:fs';
import minifyJson from 'strip-json-comments';
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

export default class World {
    private readonly uniqueId: string = UUID.randomString();
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

    public async onEnable(): Promise<void> {
        this.server.getEventManager().on('tick', async (evt) => this.update(evt.getTick()));

        try {
            const metaData: LevelMeta = JSON.parse(
                await fs.promises.readFile(path.join(this.path, 'level.json'), 'utf-8')
            );

            if (metaData.spawn) this.setSpawnPosition(Vector3.fromObject(metaData.spawn));

            if (metaData.gameRules) {
                metaData.gameRules.forEach(([name, [value, editable]]) =>
                    this.gameruleManager.setGamerule(name, value, editable)
                );
            }
        } catch (error: unknown) {
            this.server.getLogger()?.warn(`Failed to read level.json due to ${error}`, 'World/onEnable');
        }

        this.provider.setWorld(this);
        await this.provider.onEnable();

        this.server
            .getLogger()
            ?.info(
                `Preparing start region for dimension §b'${this.name}'/${this.generator.constructor.name}§r`,
                'World/onEnable'
            );
        const chunksToLoad: Array<Promise<Chunk>> = [];
        const timer = new Timer();

        const size = this.server.getConfig().getViewDistance() * 5;
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                chunksToLoad.push(this.loadChunk(x, z, true));
            }
        }

        await Promise.all(chunksToLoad);
        this.server.getLogger()?.verbose(`(took ${timer.stop()} ms)`, 'World/onEnable');
    }

    public async onDisable() {
        await fs.promises.writeFile(
            path.join(this.path, 'level.json'),
            JSON.stringify(
                {
                    spawn: await this.getSpawnPosition(),
                    gamerules: Array.from(this.getGameruleManager().getGamerules())
                },
                null,
                4
            )
        );
        await this.provider.onDisable();
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
        return this.server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta);
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
                player.getServer().getLogger()?.warn(`${player.getName()} failed to place block due to ${error}`);
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
        this.server
            .getLogger()
            ?.info(`Saving chunks for level §b'${this.name}'/${this.generator.constructor.name}§r`, 'World/saveChunks');

        await Promise.all(
            Array.from(this.chunks.values())
                .filter((c) => c.getHasChanged())
                .map(async (chunk) => this.provider.writeChunk(chunk))
        );
        this.server.getLogger()?.verbose(`(took ${timer.stop()} ms)!`, 'World/saveChunks');
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
    public getUniqueId(): string {
        return this.uniqueId;
    }

    public getName(): string {
        return this.name;
    }

    public getSeed(): number {
        return this.seed;
    }

    public async getPlayerData(player: Player): Promise<WorldPlayerData> {
        try {
            const playerData = fs.readFileSync(
                path.join(cwd(), 'worlds', this.getName(), 'playerdata', `${player.getXUID()}.json`)
            );

            return JSON.parse(minifyJson(playerData.toString('utf-8'))) as WorldPlayerData;
        } catch {
            this.server
                .getLogger()
                ?.debug(`PlayerData is missing for player ${player.getXUID()}`, 'World/getPlayerData');

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
        try {
            fs.writeFileSync(
                path.join(cwd(), 'worlds', this.getName(), 'playerdata', `${player.getXUID()}.json`),
                JSON.stringify(
                    {
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
                                if (!entry) return null;

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
                            .filter((a) => a && a.numeric_id > 0) as any
                    } as WorldPlayerData,
                    null,
                    4
                )
            );
        } catch (error: unknown) {
            this.server.getLogger()?.error(`Failed to save player data: ${error}`, 'World/savePlayerData');
            this.server.getLogger()?.error(error, 'World/savePlayerData');
        }
    }
}
