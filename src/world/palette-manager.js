const fs = require('fs')

const NBT = require('jsnamedbinarytag')
const Tag = require('jsnamedbinarytag/tags/internal/tag')
const ListTag = require('jsnamedbinarytag/tags/list-tag')
const logger = require('../utils/logger')

'use strict'

class PaletteManager {

    /** @type {Map<Number, Number>} */
    static #idToRuntime = new Map()
    /** @type {Map<Number, Number>} */
    static #runtimeToId = new Map()
    /** @type {Tag[]} */
    static #states = null

    static init() {
        let runtimeIds = fs.readFileSync(__dirname + '/../resources/required_block_states.nbt')
        let tag = (new NBT()).readTag(runtimeIds, true, true)
        if (!(tag instanceof ListTag)) {
            return logger.error(
                `Invalid states table: expected ListTag, got ${tag.constructor.name}`
            )
        }

        this.#states = tag.value
        logger.debug('Succesfully initialized block states!')
    }

    /**
     * Returns the paletted id from the static id.
     * 
     * @param {number} id 
     * @returns {number}
     */
    static fromStaticToRuntime(id) {
        // TODO
    }

    static getRuntimeStates() {
        return this.#states
    }

}
module.exports = PaletteManager