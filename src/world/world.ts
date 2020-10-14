import Entity from "../entity/entity";
import Vector3 from "../math/vector3";
import Player from "../player/Player";
import Prismarine from "../prismarine";

const UUID = require('../utils/uuid');
const CoordinateUtils = require('../world/coordinate-utils');
const WorldEventPacket = require('../network/packet/world-event');
const { GameruleManager, Rules } = require('../world/gamerule-manager');
const SharedSeedRandom = require('./util/shared-seed-random');

interface WorldData {
    name: string,
    server: Prismarine,
    provider: any,
    seed: number,
    generator?: string
}

export default class World {
    private uniqueId: string = UUID.randomString();
    private name: string = "Unknown";
    private players: Map<number, Player> = new Map();
    private entities: Map<number, Entity> = new Map();
    private chunks: Map<string, any> = new Map();
    private gameruleManager: any = new GameruleManager();
    private currentTick: number = 0;
    private provider: any;   // TODO: interface
    private server: Prismarine
    private seed: number | bigint;
    private generator: any;  // TODO: interface

    constructor({ name, server, provider, seed, generator = 'overworld' }: WorldData) {
        this.name = name;
        this.server = server;
        this.provider = provider;
        this.seed = new SharedSeedRandom(seed);
        this.generator = generator;

        // TODO: Load default gamrules
        this.getGameruleManager().setGamerule(Rules.DoDayLightCycle, true);
        this.getGameruleManager().setGamerule(Rules.ShowCoordinates, true);

        (async () => {
            const time = Date.now();
            server.getLogger().info(`Preparing start region for dimension §b'${name}'/${generator}§r`);
            server.getLogger().info('Preparing spawn area: 0%');

            let loaded = 0;
            for (let x = 0; x < 32; x++) {
                for (let z = 0; z < 32; z++) {
                    await this.loadChunk(x, z, true);

                    loaded++;

                    if (loaded % 10 == 0) {
                        server.getLogger().info(`Preparing spawn area: ${Math.floor((loaded / 1024) * 100)}%`);
                    }

                    if (loaded == 1024) {
                        server.getLogger().info(`Preparing spawn area: 100%`);
                        server.getLogger().info(`Time elapsed: ${(Date.now() - time)} ms`);
                    }
                }
            }
        })();
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
            // Maybe send time to players? 
            // this.sendTime()
        }

        // TODO: tick chunks
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     * 
     * @param x 
     * @param z 
     * @param generate 
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
    public async loadChunk(x: number, z: number, _generate: boolean): Promise<any> {
        let index = CoordinateUtils.encodePos(x, z);
        if (!this.chunks.has(index)) {
            const generator = this.server.getWorldManager().getGeneratorManager().getGenerator(this.generator);
            if (!generator) {
                this.server.getLogger().error(`Invalid generator §b${this.generator}§r!`);
                throw new Error('invalid generator');
            }

            // try - catch for provider errors
            let chunk = await this.provider.readChunk({
                x,
                z,
                generator,
                seed: this.seed
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
    public sendWorldEvent(position: Vector3|null, worldEvent: number, data: number): void {
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
     * 
     * @param x 
     * @param z 
     * @param generate
     */
    public async getChunkAt(x: number, z: number, generate = false): Promise<any> {
        return await this.getChunk(x >> 4, z >> 4, generate);
    }

    /**
     * Returns the world default spawn position.
     */
    public async getSpawnPosition(): Promise<Vector3> {
        let x = 0, z = 0;  // TODO: replace with actual data
        let chunk = await this.getChunkAt(z, z);
        let y = chunk.getHighestBlock(x, z) + 1;
        return new Vector3(z, y, z); 
    }

    /**
     * Adds an entity into the level and in the chunk
     * found from the entity position.
     * 
     * @param entity 
     */
    public async addEntity(entity: Entity): Promise<void> {
        this.entities.set(entity.runtimeId, entity);
        let chunk = await this.getChunkAt(entity.x, entity.z, true);
        chunk.addEntity(entity);
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
        this.server.getLogger().debug('[World save] took ' + (Date.now() - time) + 'ms');
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
