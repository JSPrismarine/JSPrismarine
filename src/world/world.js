const Entity = require('../entity/entity');
const UUID = require('../utils/uuid');
const Chunk = require('./chunk/chunk');
const CoordinateUtils = require('../world/coordinate-utils');
const Provider = require('./provider');
const WorldEventPacket = require('../network/packet/world-event');
const Vector3 = require('../math/vector3').default;
const Prismarine = require('../prismarine');
const { GameruleManager, Rules } = require('../world/gamerule-manager');
const SharedSeedRandom = require('./util/shared-seed-random');

class World {

    /** @type {string} */
    #uniqueId = UUID.randomString()
    /** @type {string} */
    #name = "Unknown"
    /** @type {Map<Number, Player>} */
    #players = new Map()
    /** @type {Map<Number, Entity>} */
    #entities = new Map()
    /** @type {Map<String, Chunk>} */
    #chunks = new Map()
    /** @type {GameruleManager} */
    #gameruleManager = new GameruleManager()
    /** @type {number} */
    #currentTick = 0
    /** @type {Provider|null} */
    #provider = null
    /** @type {Prismarine} */
    #server
    /** @type {number | bigint} */
    #seed
    /** @type {string} */
    #generator

    constructor({ name, server, provider = null, seed, generator = 'overworld' }) {
        this.#name = name;
        this.#server = server;
        this.#provider = provider;
        this.#seed = new SharedSeedRandom(seed);
        this.#generator = generator;

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
                    await this.loadChunk(x, z);

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
     * @param {number} timestamp 
     */
    update(timestamp) {
        // Continue world time ticks
        this.#currentTick += 1;

        // Tick players 
        for (let player of this.#players.values()) {
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
     * @param {number} x 
     * @param {number} z 
     * @param {boolean} generate 
     */
    async getChunk(x, z, generate = true) {
        return await this.loadChunk(x, z, generate);
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     * 
     * @param {number} x 
     * @param {number} z 
     */
    async loadChunk(x, z) {
        let index = CoordinateUtils.encodePos(x, z);
        if (!this.#chunks.has(index)) {
            const generator = this.#server.getWorldManager().getGeneratorManager().getGenerator(this.#generator);
            if (!generator) {
                this.#server.getLogger().error(`Invalid generator §b${this.#generator}§r!`);
                throw new Error('invalid generator');
            }

            let chunk = await this.#provider.readChunk({
                x,
                z,
                generator,
                seed: this.#seed
            });
            this.#chunks.set(index, chunk);
        }
        return this.#chunks.get(index);
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     * 
     * @param {Vector3|null} position - world positon
     * @param {number} worldEvent - event identifier
     * @param {number} data 
     */
    sendWorldEvent(position, worldEvent, data) {
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
     * @param {number} x 
     * @param {number} z 
     * @param {boolean} generate
     * @returns {Chunk}
     */
    async getChunkAt(x, z, generate = false) {
        return await this.getChunk(x >> 4, z >> 4, generate);
    }

    /**
     * Returns the world default spawn position.
     * 
     * @returns {Vector3}
     */
    async getSpawnPosition() {
        let x = 0, z = 0;  // TODO: replace with actual data
        let chunk = await this.getChunkAt(z, z);
        let y = chunk.getHighestBlock(x, z) + 1;
        return new Vector3(z, y, z); 
    }

    /**
     * Adds an entity into the level and in the chunk
     * found from the entity position.
     * 
     * @param {Entity} entity 
     */
    addEntity(entity) {
        this.#entities.set(entity.runtimeId, entity);
        this.getChunkAt(entity.x, entity.z, true).addEntity(entity);
    }

    /**
     * Adds a player into the level. 
     */
    addPlayer(player) {
        this.#players.set(player.runtimeId, player);
    }

    /**
     * Removes a player from the level.
     */
    removePlayer(player) {
        this.#players.delete(player.runtimeId);
    }

    /**
     * Saves changed chunks into disk.
     * 
     * @returns {void}
     */
    async saveChunks() {
        let time = Date.now();
        this.#server.getLogger().debug('[World save] saving chunks...');
        for (let chunk of this.#chunks.values()) {
            if (chunk.hasChanged()) {
                await this.#provider.writeChunk(chunk);
                chunk.setChanged(false);
            }
        }
        this.#server.getLogger().debug('[World save] took ' + (Date.now() - time) + 'ms');
    }

    async save() {
        // Save chunks
        await this.saveChunks();
    }

    close() {
        // TODO
    }

    getGameruleManager() {
        return this.#gameruleManager;
    }

    getTicks() {
        return this.#currentTick;
    }

    get provider() {
        return this.#provider;
    }

    // this is used for example in start game packet
    get uniqueId() {
        return this.#uniqueId;
    }

    get name() {
        return this.#name;
    }

}
module.exports = World;
