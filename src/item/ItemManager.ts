import fs from "fs";
import path from "path";

import Item from "./";
import * as Logger from "../utils/Logger";

export default class ItemManager {
    private items = new Map()

    constructor() {
        this.importItems();
    }

    public getItem(name: string): Item {
        return this.items.get(name)
    }
    public getItems(): Array<Item> {
        return Array.from(this.items.values());
    }

    public registerClassItem = (item: Item) => {
        Logger.silly(`Item with id §b${item.name}§r registered`);
        item.setRuntimeId(this.items.size);
        this.items.set(item.name, item);
    }

    importItems() {
        try {
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            items.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts'))
                    return;  // Exclude test files

                const item = require(`./items/${id}`).default;
                try {
                    this.registerClassItem(new item());
                } catch (err) {
                    Logger.error(`${id} failed to register!`);
                }
            });
            Logger.debug(`Registered §b${items.length}§r item(s)!`);
        } catch (err) {
            Logger.error(`Failed to register items: ${err}`);
        }
    }
}
