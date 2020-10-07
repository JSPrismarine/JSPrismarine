'use strict'
const fs = require('fs')
const path = require('path')
const logger = require('../../utils/logger')

class ItemManager {
    #items = []
    #blocks = []

    constructor() {
        // this.importItems()
        this.importBlocks()
    }

    getItem(name) {
        return this.#items.filter(a => a.name === name)
    }
    getItems() {
        return this.#items
    }
    getBlock(name) {
        return this.#blocks.filter(a => a.name === name)
    }
    getBlocks() {
        return this.#blocks
    }

    registerClassItem = (item) => {
        // TODO: check for duplicates
        logger.silly(`Item with id §b${item.name}§r registered`)
        this.#blocks.push(item)
    }
    registerClassBlock = (block) => {
        // TODO: check for duplicates
        logger.silly(`Block with id §b${block.name}§r registered`)
        this.#blocks.push(block)
    }

    importItems = () => {
        const items = fs.readdirSync(path.join(__dirname, 'items'))
        items.forEach((id) => {
            if (id.includes('.test.'))
                return  // Exclude test files

            const item = require(`./items/${id}`)
            try {
                this.registerClassItem(new item())
            } catch (err) {
                logger.error(`${id} failed to register!`)
            }
        })
        logger.debug(`Registered ${items.length} item(s)!`)
    }
    importBlocks = () => {
        const blocks = fs.readdirSync(path.join(__dirname, 'blocks'))
        blocks.forEach((id) => {
            if (id.includes('.test.'))
                return  // Exclude test files

            const block = require(`./blocks/${id}`)
            try {
                this.registerClassBlock(new block())
            } catch (err) {
                logger.error(`${id} failed to register!`)
            }
        })
        logger.debug(`Registered ${blocks.length} block(s)!`)
    }
}
module.exports = ItemManager
