import fs from "fs";
import path from "path";

import Item from "./";
import Prismarine from "../prismarine";

export default class ItemManager {
    private server: Prismarine;
    private items = new Map()

    constructor(server: Prismarine) {
        this.server = server;
        this.importItems();
    }

    public getItem(name: string): Item {
        return this.items.get(name)
    }
    public getItems(): Array<Item> {
        return Array.from(this.items.values());
    }

    public registerClassItem = (item: Item) => {
        this.server.getLogger().silly(`Item with id §b${item.name}§r registered`);
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
                    this.server.getLogger().error(`${id} failed to register!`);
                }
            });
            this.server.getLogger().debug(`Registered §b${items.length}§r item(s)!`);
        } catch (err) {
            this.server.getLogger().error(`Failed to register items: ${err}`);
        }
    }
}
