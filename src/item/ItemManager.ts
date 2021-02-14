import Item from './Item';
import ItemRegisterEvent from '../events/items/ItemRegisterEvent';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class ItemManager {
    private readonly server: Server;
    private readonly items = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        await this.importItems();
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

    /**
     * Get item by numeric id
     */
    public getItemById(id: number): Item | null {
        return this.getItems().find((a) => a.getId() === id) ?? null;
    }

    public getItems(): Item[] {
        return Array.from(this.items.values());
    }

    public registerClassItem = async (item: Item) => {
        const event = new ItemRegisterEvent(item);
        await this.server.getEventManager().emit('itemRegister', event);
        if (event.cancelled) return;

        this.server.getLogger().silly(`Item with id §b${item.getName()}§r registered`, 'ItemManager/registerClassItem');
        this.items.set(item.getName(), item);
    };

    /**
     * Loops through ./src/item/items and register them
     */
    private async importItems() {
        try {
            const time = Date.now();
            const items = fs.readdirSync(path.join(__dirname, 'items'));
            await Promise.all(
                items.map(async (id: string) => {
                    if (id.includes('.test.') || id.includes('.d.ts') || id.includes('.map')) return; // Exclude test files

                    const item = require(`./items/${id}`).default;
                    try {
                        await this.registerClassItem(new item());
                    } catch {
                        this.server.getLogger().error(`${id} failed to register!`, 'ItemManager/importItems');
                    }
                })
            );
            this.server
                .getLogger()
                .debug(
                    `Registered §b${this.items.size}§r item(s) (took ${Date.now() - time} ms)!`,
                    'ItemManager/importItems'
                );
        } catch (error) {
            this.server.getLogger().error(`Failed to register items: ${error}`, 'ItemManager/importItems');
        }
    }
}
