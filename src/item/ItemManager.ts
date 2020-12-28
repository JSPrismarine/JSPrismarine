import Item from './Item';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class ItemManager {
    private readonly server: Server;
    private readonly items = new Map();

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        this.importItems();
    }

    /**
     * OnDisable hook
     */
    public async onDisable() {
        this.items.clear();
    }

    public getItem(name: string): Item {
        return this.items.get(name);
    }

    public getItems(): Item[] {
        return Array.from(this.items.values());
    }

    public registerClassItem = (item: Item) => {
        this.server
            .getLogger()
            .silly(`Item with id §b${item.name}§r registered`);
        item.setRuntimeId(this.items.size);
        this.items.set(item.name, item);
    };

    /**
     * Loops through ./src/item/items and register them
     */
    importItems() {
        try {
            const time = Date.now();
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            items.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts')) return; // Exclude test files

                const item = require(`./items/${id}`).default;
                try {
                    this.registerClassItem(new item());
                } catch {
                    this.server.getLogger().error(`${id} failed to register!`);
                }
            });
            this.server
                .getLogger()
                .debug(
                    `Registered §b${items.length}§r item(s) (took ${
                        Date.now() - time
                    } ms)!`
                );
        } catch (error) {
            this.server.getLogger().error(`Failed to register items: ${error}`);
        }
    }
}
