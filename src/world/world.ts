import Block from '../block/Block';
import Entity from '../entity/entity';
import Item from '../item/Item';
import Vector3 from '../math/Vector3';
import UpdateBlockPacket from '../network/packet/UpdateBlockPacket';
import WorldEventPacket from '../network/packet/WorldEventPacket';
import Player from '../player/Player';
import Prismarine from '../Prismarine';
import Chunk from './chunk/Chunk';

const LevelSoundEventPacket = require('../network/packet/LevelSoundEventPacket');
const UUID = require('../utils/uuid').default;
const CoordinateUtils = require('../world/coordinate-utils');
const { GameruleManager, Rules } = require('../world/gamerule-manager');
const SharedSeedRandom = require('./util/shared-seed-random');

interface WorldData {
    name: string;
    server: Prismarine;
    provider: any;
    seed: number;
    generator?: string;
}

export default class World {
    private uniqueId: string = UUID.randomString();
    private name: string = 'Unknown';
    private players: Map<bigint, Player> = new Map();
    private entities: Map<bigint, Entity> = new Map();
    private chunks: Map<string, any> = new Map();
    private gameruleManager: any;
    private currentTick: number = 0;
    private provider: any; // TODO: interface
    private server: Prismarine;
    private seed: number | bigint;
    private generator: any; // TODO: interface

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
        this.getGameruleManager().setGamerule(Rules.DoDayLightCycle, true);
        this.getGameruleManager().setGamerule(Rules.ShowCoordinates, true);
    }

    public async onEnable() {
        this.server
            .getLogger()
            .info(
                `Preparing start region for dimension §b'${this.name}'/${this.generator}§r`
            );
        const chunksToLoad: Array<Promise<void>> = [];
        const time = Date.now();

        for (let x = 0; x < 32; x++) {
            for (let z = 0; z < 32; z++) {
                chunksToLoad.push(this.loadChunk(x, z, true));
            }
        }

        await Promise.all(chunksToLoad);
        this.server.getLogger().info(`(took ${Date.now() - time} ms)`);
    }

    /**
     * Called every tick.
     *
     * @param timestamp
     */
    public async update(timestamp: number): Promise<void> {
        // Continue world time ticks
        this.currentTick += 1;

        // Tick players
        for (let player of this.players.values()) {
            player.update(timestamp);

            if (this.currentTick % 5)
                player.getPlayerConnection().sendTime(this.currentTick);
        }

        // TODO: tick chunks
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     */
    public async getChunk(x: number, z: number, generate = true): Promise<any> {
        return await this.loadChunk(x, z, generate);
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
    ): Promise<any> {
        let index = CoordinateUtils.encodePos(x, z);
        if (!this.chunks.has(index)) {
            const generator = this.server
                .getWorldManager()
                .getGeneratorManager()
                .getGenerator(this.generator);
            if (!generator) {
                this.server
                    .getLogger()
                    .error(`Invalid generator §b${this.generator}§r!`);
                throw new Error('invalid generator');
            }

            // try - catch for provider errors
            let chunk = await this.provider.readChunk({
                x,
                z,
                generator,
                seed: this.seed,
                server: this.server
            });
            this.chunks.set(index, chunk);
        }
        return this.chunks.get(index);
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
        let worldEventPacket = new WorldEventPacket();
        worldEventPacket.eventId = worldEvent;
        worldEventPacket.data = data;
        if (position != null) {
            // TODO: this.getChunkAt(position.getX(), position.getZ()).
            // Save player into the chunk directly
        } else {
            // to all players
        }
    }

    /**
     * Returns a chunk from minecraft block positions x and z.
     */
    public async getChunkAt(
        x: number | VarInt,
        z: number | VarInt,
        generate = false
    ): Promise<Chunk> {
        // Handle negative chunk values, where "">> 4" doesn't work for obvious reasons
        return await this.getChunk(
            x < 0 ? -1 : 1 * (Math.abs(x as number) >> 4),
            z < 0 ? -1 : 1 * (Math.abs(z as number) >> 4),
            generate
        );
    }

    /**
     * Returns the world default spawn position.
     */
    public async getSpawnPosition(): Promise<Vector3> {
        let x = 0,
            z = 0; // TODO: replace with actual data
        let chunk = await this.getChunkAt(x, z);
        let y = chunk.getHighestBlock(x, z) + 1;
        return new Vector3(z, y + 2, z);
    }

    public async useItemOn(
        itemInHand: Item | Block | null,
        blockPosition: Vector3,
        face: number,
        clickPosition: Vector3,
        player: Player
    ): Promise<void> {
        //TODO: checks

        // TODO: set block on the desired face

        // maybe let place = new Promise ( do all placing stuff )
        // then if place is true, play sound

        if (itemInHand instanceof Item) return; // TODO

        const chunk = await this.getChunkAt(
            blockPosition.getX(),
            blockPosition.getZ()
        );
        const block = itemInHand; // TODO: get block from itemInHand
        if (!block)
            return this.server
                .getLogger()
                .warn(`Block with runtimeId ${0} is invalid`);

        chunk.setBlock(
            blockPosition.getX() % 16,
            blockPosition.getY(),
            blockPosition.getZ() % 16,
            block
        );

        const blockUpdate = new UpdateBlockPacket();
        blockUpdate.x = blockPosition.getX();
        blockUpdate.y = blockPosition.getY();
        blockUpdate.z = blockPosition.getZ();
        blockUpdate.BlockRuntimeId = block.getRuntimeId();

        for (let p of this.server.getOnlinePlayers()) {
            p.getPlayerConnection().sendDataPacket(blockUpdate);
        }

        const pk = new LevelSoundEventPacket();
        pk.sound = 6; // TODO: enum

        pk.positionX = player.getX();
        pk.positionY = player.getY();
        pk.positionZ = player.getZ();

        pk.extraData = -1;
        pk.entityType = ':';
        pk.isBabyMob = false;
        pk.disableRelativeVolume = false;

        for (let p of player.getPlayersInChunk()) {
            p.getPlayerConnection().sendDataPacket(pk);
        }
    }

    /**
     * Adds an entity into the level and in the chunk
     * found from the entity position.
     *
     * @param entity
     */
    public async addEntity(entity: Entity): Promise<void> {
        this.entities.set(entity.runtimeId, entity);
        let chunk = await this.getChunkAt(entity.getX(), entity.getZ(), true);
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
        let time = Date.now();
        this.server.getLogger().debug('[World save] saving chunks...');
        for (let chunk of this.chunks.values()) {
            if (chunk.hasChanged()) {
                await this.provider.writeChunk(chunk);
                chunk.setChanged(false);
            }
        }
        this.server
            .getLogger()
            .debug('[World save] took ' + (Date.now() - time) + 'ms');
    }

    public async save(): Promise<void> {
        // Save chunks
        await this.saveChunks();
    }

    public close(): void {
        // TODO
    }

    public getGameruleManager(): any {
        return this.gameruleManager;
    }

    public getTicks(): number {
        return this.currentTick;
    }
    public setTicks(tick: number) {
        this.currentTick = tick;
    }

    public getProvider(): any {
        return this.provider;
    }

    // this is used for example in start game packet
    public getUniqueId(): string {
        return this.uniqueId;
    }

    public getName(): string {
        return this.name;
    }
}
