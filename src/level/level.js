const Entity = require('../entity/entity')
const UUID = require('../utils/uuid')
const Chunk = require('./chunk/chunk')
const CoordinateUtils = require('../level/coordinate-utils')

'use strict'

class Level {
    
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

    constructor(server, name, provider) {
        this.#name = name
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     * 
     * @param {number} x 
     * @param {number} z 
     * @param {boolean} generate 
     */
    getChunk(x, z, generate = true) {
        let index = CoordinateUtils.chunkId(x, z)
        if (this.#chunks.has(index)) {
            return this.#chunks.get(index)
        } else if (this.loadChunk(x, z, generate)) {
            return this.#chunks.get(index)
        }
        
        return null
    }

    /**
     * Loads a chunk in a given x and z.
     * 
     * @param {number} x 
     * @param {number} z 
     * @param {boolean} generate
     */
    loadChunk(x, z, generate) {
        let index = CoordinateUtils.chunkId(x, z)
        if (this.#chunks.has(index)) {
            return true
        }

        let chunk = null
        // TODO: providers, this is just an experiment
        // generate is used if the chunk from the provider cannot
        // be loaded, so a flat chunk is generated (convention)
        if (chunk === null && generate) {
            chunk = new Chunk(x, z)
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    let y = 0
                    chunk.setBlockId(x, y++, z, 7)
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y++, z, 3)
                    chunk.setBlockId(x, y, z, 2)
                    // TODO: block light
                }
            }
        }

        this.#chunks.set(index, chunk)
        return true
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
        this.#entities[entity.runtimeId] = entity
        this.getChunkAt(entity.x, entity.z, true).addEntity(entity)
    } 
    
    /**
     * Adds a player into the level. 
     */
    addPlayer(player) {
        this.#players[player.runtimeId] = player
    }

    // this is used for example in start game packet
    get uniqueId() {
        return this.#uniqueId
    }

    get name() {
        return this.#name
    }
}
module.exports = Level