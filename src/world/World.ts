import Block from '../block/Block';
import Entity from '../entity/entity';
import Item from '../item/Item';
import Vector3 from '../math/Vector3';
import DataPacket from '../network/packet/DataPacket';
import LevelSoundEventPacket from '../network/packet/LevelSoundEventPacket';
import UpdateBlockPacket from '../network/packet/UpdateBlockPacket';
import WorldEventPacket from '../network/packet/WorldEventPacket';
import Player from '../player/Player';
import Server from '../Server';
import UUID from '../utils/UUID';
import Chunk from './chunk/Chunk';
import CoordinateUtils from './CoordinateUtils';
import GameruleManager, { GameRules } from './GameruleManager';
import SharedSeedRandom from './util/SharedSeedRandom';

interface WorldData {
    name: string;
    server: Server;
    provider: any;
    seed: number;
    generator?: string;
}

export default class World {
    private readonly uniqueId: string = UUID.randomString();
    private name: string;

    private readonly players: Map<bigint, Player> = new Map();
    private readonly entities: Map<bigint, Entity> = new Map();
    private readonly chunks: Map<string, Chunk> = new Map();
    private readonly gameruleManager: GameruleManager;
    private currentTick = 0;
    private readonly provider: any; // TODO: interface
    private readonly server: Server;
    private readonly seed: SharedSeedRandom;
    private readonly generator: any; // TODO: interface

    constructor({
        name,
        server,
        provider,
        seed,
        generator = 'overworld'
    }: WorldData) {
        this.name = name;
        this.server = server;
        this.provider = provider;
        this.gameruleManager = new GameruleManager(server);
        this.seed = new SharedSeedRandom(seed);
        this.generator = generator;

        // TODO: Load default gamrules
        // TODO: getGameruleManager().showCoordinates(true ?? false);
        this.getGameruleManager().setGamerule(GameRules.DoDayLightCycle, true);
        this.getGameruleManager().setGamerule(GameRules.ShowCoordinates, true);
    }

    public async onEnable(): Promise<void> {
        this.server
            .getLogger()
            .info(
                `Preparing start region for dimension §b'${this.name}'/${this.generator}§r`,
                'World/onEnable'
            );
        const chunksToLoad: Array<Promise<Chunk>> = [];
        const time = Date.now();

        for (let x = 0; x < 32; x++) {
            for (let z = 0; z < 32; z++) {
                chunksToLoad.push(this.loadChunk(x, z, true));
            }
        }

        await Promise.all(chunksToLoad);
        this.server
            .getLogger()
            .info(`(took ${Date.now() - time} ms)`, 'World/onEnable');
    }

    /**
     * Called every tick.
     *
     * @param timestamp
     */
    public async update(timestamp: number): Promise<void> {
        // Auto save every 2 minutes
        if (this.currentTick / 20 === 2 * 60) {
            await this.save();
        }

        // Tick players
        for (const player of this.players.values()) {
            await player.update(timestamp);
            // TODO: get documentation about timings from vanilla
            // 1 second / 20 = 1 tick, 20 * 5 = 1 second
            // 1 second * 60 = 1 minute
            if (this.currentTick % (20 * 5 * 60 * 1) === 0) {
                await player.getConnection().sendTime(this.currentTick);
            }
        }

        // TODO: tick chunks

        // Continue world time ticks
        this.currentTick++;
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     */
    public async getChunk(
        x: number,
        z: number,
        generate = true
    ): Promise<Chunk> {
        return this.loadChunk(x, z, generate);
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     *
     * @param x
     * @param z
     */
    public async loadChunk(
        x: number,
        z: number,
        _generate: boolean
    ): Promise<Chunk> {
        const index = CoordinateUtils.encodePos(x, z);
        if (!this.chunks.has(index)) {
            const generator = this.server
                .getWorldManager()
                .getGeneratorManager()
                .getGenerator(this.generator);
            if (!generator) {
                this.server
                    .getLogger()
                    .error(
                        `Invalid generator §b${this.generator}§r!`,
                        'World/loadChunk'
                    );
                throw new Error('invalid generator');
            }

            // Try - catch for provider errors
            const chunk = await this.provider.readChunk({
                x,
                z,
                generator,
                seed: this.seed,
                server: this.server
            });
            this.chunks.set(index, chunk);
        }

        return this.chunks.get(index) as Chunk;
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     *
     * @param position - world positon
     * @param worldEvent - event identifier
     * @param data
     */
    public sendWorldEvent(
        position: Vector3 | null,
        worldEvent: number,
        data: number
    ): void {
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

    // Public playSound()

    /**
     * Returns a chunk from minecraft block positions x and z.
     */
    public async getChunkAt(
        x: number,
        z: number,
        generate = false
    ): Promise<Chunk> {
        return this.getChunk(Math.floor(x / 16), Math.floor(z / 16), generate);
    }

    /**
     * Returns the world default spawn position.
     */
    public async getSpawnPosition(): Promise<Vector3> {
        const x = 0;
        const z = 0; // TODO: replace with actual data
        const chunk = await this.getChunkAt(x, z);
        const y = chunk.getHighestBlock(x, z) + 1;
        return new Vector3(z, y + 2, z);
    }

    public broadcastPacket(packet: DataPacket, targets?: Player[]): void {}

    public async useItemOn(
        itemInHand: Item | Block | null,
        blockPosition: Vector3,
        face: number,
        clickPosition: Vector3,
        player: Player
    ): Promise<void> {
        if (!itemInHand)
            return this.server
                .getLogger()
                .warn(`Block with runtimeId ${0} is invalid`);
        if (itemInHand instanceof Item) return; // TODO

        // TODO: checks
        // TODO: canInteract

        const block = itemInHand; // TODO: get block from itemInHand
        const clickedBlock = this.server
            .getBlockManager()
            .getBlockById(
                (
                    await this.getChunkAt(
                        blockPosition.getX(),
                        blockPosition.getZ()
                    )
                ).getBlockId(
                    blockPosition.getX() % 16,
                    blockPosition.getY(),
                    blockPosition.getZ() % 16
                )
            );

        if (!block || !clickedBlock) return;
        if (clickedBlock.getName() === 'minecraft:air' || !block.canBePlaced())
            return;

        const placedPosition = new Vector3(
            blockPosition.getX(),
            blockPosition.getY(),
            blockPosition.getZ()
        );

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

        if (blockPosition.getY() < 0) return; // TODO: broadcast to player

        const success: boolean = await new Promise(async (resolve) => {
            try {
                const chunk = await this.getChunkAt(
                    placedPosition.getX(),
                    placedPosition.getZ()
                );

                chunk.setBlock(
                    placedPosition.getX() % 16,
                    placedPosition.getY(),
                    placedPosition.getZ() % 16,
                    block
                );
                return resolve(true);
            } catch (error) {
                player
                    .getServer()
                    .getLogger()
                    .warn(
                        `${player.getUsername()} failed to place block due to ${error}`
                    );
                await player.sendMessage(error?.message);

                return resolve(false);
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

        const runtimeId = this.server
            .getBlockManager()
            .getRuntimeWithMeta(block.getId(), block.getMeta());

        const blockUpdate = new UpdateBlockPacket();
        blockUpdate.x = placedPosition.getX();
        blockUpdate.y = placedPosition.getY();
        blockUpdate.z = placedPosition.getZ();
        blockUpdate.blockRuntimeId = runtimeId;

        await Promise.all(
            this.server
                .getOnlinePlayers()
                .map(async (onlinePlayer) =>
                    onlinePlayer.getConnection().sendDataPacket(blockUpdate)
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
                .map(async (narbyPlayer) =>
                    narbyPlayer.getConnection().sendDataPacket(pk)
                )
        );
    }

    public async sendTime(): Promise<void> {
        for (const player of this.players.values()) {
            await player.setTime(this.getTicks());
        }
    }

    /**
     * Adds an entity into the level and in the chunk
     * found from the entity position.
     */
    public async addEntity(entity: Entity): Promise<void> {
        this.entities.set(entity.runtimeId, entity);
        const chunk = await this.getChunkAt(entity.getX(), entity.getZ(), true);
        chunk.addEntity(entity as any);
    }

    /**
     * Adds a player into the level.
     */
    public addPlayer(player: Player): void {
        this.players.set(player.runtimeId, player);
    }

    /**
     * Removes a player from the level.
     */
    public removePlayer(player: Player): void {
        this.players.delete(player.runtimeId);
    }

    /**
     * Saves changed chunks into disk.
     */
    public async saveChunks(): Promise<void> {
        const time = Date.now();
        this.server.getLogger().debug('saving chunks...', 'World/saveChunks');
        const promises: Array<Promise<void>> = [];
        for (const chunk of this.chunks.values()) {
            if (chunk.hasChanged()) {
                promises.push(this.provider.writeChunk(chunk));
                chunk.setChanged(false);
            }
        }

        await Promise.all(promises);
        this.server
            .getLogger()
            .debug('took ' + (Date.now() - time) + 'ms', 'world/saveChunks');
    }

    public async save(): Promise<void> {
        // Save chunks
        await this.saveChunks();
    }

    public async close(): Promise<void> {
        await this.getProvider().close();
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
}
