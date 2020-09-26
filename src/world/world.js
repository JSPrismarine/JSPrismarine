const perlinNoise3d = require('perlin-noise-3d')
const perlin = require('perlin-noise')

const Entity = require('../entity/entity')
const UUID = require('../utils/uuid')
const Chunk = require('./chunk/chunk')
const CoordinateUtils = require('../world/coordinate-utils')
const Provider = require('./provider')
const WorldEventPacket = require('../network/packet/world-event')
const Vector3 = require('../math/vector3')
const Prismarine = require('../prismarine')
const { GameruleManager, Rules } = require('../world/gamerule-manager')

'use strict'

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
    /** @type {Provider|null} */
    #provider = null
    /** @type {Prismarine} */
    #server

    constructor(name, server, provider = null) {
        this.#name = name
        this.#server = server
        this.#provider = provider

        // TODO: Load default gamrules
        this.getGameruleManager().setGamerule(Rules.ShowCoordinates, true)
    }

    update(timestamp) {

        // Tick players 
        for (let player of this.#players.values()) {
            player.update(timestamp)
            // Maybe send time to players? 
            // this.sendTime()
        }

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
        return await this.loadChunk(x, z, generate)
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     * 
     * @param {number} x 
     * @param {number} z 
     * @param {boolean} generate
     */
    async loadChunk(x, z, generate) {
        let index = CoordinateUtils.encodePos(x, z)
        if (!this.#chunks.has(index)) {
            let chunk = await this.#provider.readChunk(x, z)
            this.#chunks.set(index, chunk)
        }
        return this.#chunks.get(index)
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     * 
     * @param {Vector3|null} position - world positon
     * @param {number} worldEvent - event identifier
     * @param {number} data 
     */
    sendWorldEvent(position, worldEvent, data) {
        let worldEventPacket = new WorldEventPacket()
        worldEventPacket.eventId = worldEvent
        worldEventPacket.data = data
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
    getChunkAt(x, z, generate = false) {
        return this.getChunk(x >> 4, z >> 4, generate)
    }

    /**
     * Adds an entity into the level and in the chunk
     * found from the entity position.
     * 
     * @param {Entity} entity 
     */
    addEntity(entity) {
        this.#entities.set(entity.runtimeId, entity)
        this.getChunkAt(entity.x, entity.z, true).addEntity(entity)
    } 
    
    /**
     * Adds a player into the level. 
     */
    addPlayer(player) {
        this.#players.set(player.runtimeId, player)
    }

    /**
     * Removes a player from the level.
     */
    removePlayer(player) {
        this.#players.delete(player.runtimeId)
    }

    /**
     * Saves changed chunks into disk.
     * 
     * @returns {void}
     */
    async saveChunks() {
        let time = Date.now()
        this.#server.getLogger().debug('[World save] saving chunks...')
        for (let chunk of this.#chunks.values()) {
            if (chunk.hasChanged()) {
                await this.#provider.writeChunk(chunk)
                chunk.setChanged(false)
            }
        }
        this.#server.getLogger().debug('[World save] took ' + (Date.now() - time) + 'ms')
    }

    async save() {
        // Save chunks
        await this.saveChunks()
    }

    close() {
        // TODO
    }

    getGameruleManager() {
        return this.#gameruleManager
    }

    get provider() {
        return this.#provider
    }

    // this is used for example in start game packet
    get uniqueId() {
        return this.#uniqueId
    }

    get name() {
        return this.#name
    }

}
module.exports = World