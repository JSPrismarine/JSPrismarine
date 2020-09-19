const perlinNoise3d = require('perlin-noise-3d')
const perlin = require('perlin-noise')

const Entity = require('../entity/entity')
const UUID = require('../utils/uuid')
const Chunk = require('./chunk/chunk')
const CoordinateUtils = require('../world/coordinate-utils')
const Provider = require('./provider')
const WorldEventPacket = require('../network/packet/world-event')
const Vector3 = require('../math/vector3')

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
    /** @type {Map<Number, Chunk>} */
    #chunks = new Map()
    /** @type {Provider|null} */
    #provider = null

    constructor(name, provider = null) {
        this.#name = name
        this.#provider = provider
    }

    update(timestamp) {

        // Tick players 
        for (let player of this.#players.values()) {
            player.update(timestamp)
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
            await new Promise(resolve => {
                this.#provider.readChunk(x, z).then(chunk => resolve(chunk))
                // resolve(this.#provider.readChunk(x, z))
                /* let tempChunk = new Chunk(x, z)
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        for (let y = 0; y < 128; y++) { 
                            // TODO
                        }
                    }
                }
                tempChunk.recalculateHeightMap()
                resolve(tempChunk) */
            }).then(chunk => this.#chunks.set(index, chunk))
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

    close() {
        // TODO
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