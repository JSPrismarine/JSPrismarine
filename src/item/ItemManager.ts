import fs from "fs";
import path from "path";

import Item from "./";
import * as Logger from "../utils/Logger";
import Prismarine from "../prismarine";

export default class ItemManager {
    private items = new Map()

    constructor(server: Prismarine) {
        this.importItems(server);
    }

    public getItem(name: string): Item {
        return this.items.get(name)
    }
    public getItems(): Array<Item> {
        return Array.from(this.items.values());
    }

    public registerClassItem = (item: Item, server: Prismarine) => {
        server.getLogger().silly(`Item with id §b${item.name}§r registered`);
        item.setRuntimeId(this.items.size);
        this.items.set(item.name, item);
    }

    importItems(server: Prismarine) {
        try {
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            items.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts'))
                    return;  // Exclude test files

                const item = require(`./items/${id}`).default;
                try {
                    this.registerClassItem(new item(), server);
                } catch (err) {
                    server.getLogger().error(`${id} failed to register!`);
                }
            });
            server.getLogger().debug(`Registered §b${items.length}§r item(s)!`);
        } catch (err) {
            server.getLogger().error(`Failed to register items: ${err}`);
        }
    }
}
