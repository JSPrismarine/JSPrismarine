import fs from "fs";
import path from "path";

import Item from "./item";
import Logger from "../../utils/logger";

export default class ItemManager {
    #items = new Map()
    #blocks = new Map()

    constructor() {
        this.importItems();
        this.importBlocks();
    }

    getItem(name: string) {
        return this.#items.get(name)
    }
    getItems() {
        return Array.from(this.#items.values());
    }
    getBlock(name: string) {
        return this.#blocks.get(name)
    }
    getBlocks() {
        return Array.from(this.#blocks.values());
    }

    registerClassItem = (item: Item) => {
        Logger.silly(`Item with id §b${item.name}§r registered`);
        this.#items.set(item.name, item);
    }
    registerClassBlock = (block: Item) => {
        Logger.silly(`Block with id §b${block.name}§r registered`);
        this.#blocks.set(block.name, block)
    }

    importItems = () => {
        try {
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            items.forEach((id: string) => {
                if (id.includes('.test.') || !id.includes('.js'))
                    return;  // Exclude test files

                const item = require(`./items/${id}`);
                try {
                    this.registerClassItem(new (item.default || item)());
                } catch (err) {
                    Logger.error(`${id} failed to register!`);
                }
            });
            Logger.debug(`Registered §b${items.length}§r item(s)!`);
        } catch (err) {
            Logger.error(`Failed to register items: ${err}`);
        }
    }
    importBlocks = () => {
        try {
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || !id.includes('.js'))
                    return;  // Exclude test files

                const block = require(`./blocks/${id}`);
                try {
                    this.registerClassBlock(new (block.default || block)());
                } catch (err) {
                    Logger.error(`${id} failed to register!`);
                }
            });
            Logger.debug(`Registered §b${blocks.length}§r block(s)!`);
        } catch (err) {
            Logger.error(`Failed to register blocks: ${err}`);
        }
    }
}
