const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class ItemManager {
    #items = new Map()
    #blocks = new Map()

    constructor() {
        this.importItems();
        this.importBlocks();
    }

    getItem(name) {
        return this.#items.get(name); 
    }
    getItems() {
        return Array.from(this.#items.values());
    }
    getBlock(name) {
        return this.#blocks.get(name);
    }
    getBlocks() {
        return Array.from(this.#blocks.values());
    }

    registerClassItem = (item) => {
        // TODO: check for duplicates
        logger.silly(`Item with id §b${item.name}§r registered`);
        this.#items.set(item.name, item);
    }
    registerClassBlock = (block) => {
        // TODO: check for duplicates
        logger.silly(`Block with id §b${block.name}§r registered`);
        this.#blocks.set(block.name, block);
    }

    importItems = () => {
        try {
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            items.forEach((id) => {
                if (id.includes('.test.') || !id.includes('.js'))
                    return;  // Exclude test files

                const item = require(`./items/${id}`);
                try {
                    this.registerClassItem(new item());
                } catch (err) {
                    logger.error(`${id} failed to register!`);
                }
            });
            logger.debug(`Registered §b${items.length}§r item(s)!`);
        } catch (err) {
            logger.error(`Failed to register items: ${err}`);
        }
    }
    importBlocks = () => {
        try {
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id) => {
                if (id.includes('.test.') || !id.includes('.js'))
                    return;  // Exclude test files

                const block = require(`./blocks/${id}`);
                try {
                    this.registerClassBlock(new block());
                } catch (err) {
                    logger.error(`${id} failed to register!`);
                }
            });
            logger.debug(`Registered §b${blocks.length}§r block(s)!`);
        } catch (err) {
            logger.error(`Failed to register blocks: ${err}`);
        }
    }
}
module.exports = ItemManager;
