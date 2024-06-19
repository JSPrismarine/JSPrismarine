import * as Items from './Items';

import type Server from '../Server';
import ItemRegisterEvent from '../events/items/ItemRegisterEvent';
import Timer from '../utils/Timer';
import type { Item } from './Item';

// TODO: Don't dynamically import, do it like ./network/Protocol etc
export default class ItemManager {
    private readonly server: Server;
    private readonly items = new Map<string, Item>();

    /**
     * Construct an ItemManager.
     * @param {Server} server -
     * @returns {ItemManager}
     * @constructor
     */
    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @async
     */
    public async enable(): Promise<void> {
        await this.importItems();
    }

    /**
     * On disable hook.
     * @async
     */
    public async disable() {
        this.items.clear();
    }

    /**
     * Get an item from it's name.
     * @param {string} name - tha item's name.
     * @returns {Item | null} the item.
     */
    public getItem(name: string): Item | null {
        return this.items.get(name) ?? null;
    }

    /**
     * Get item by numeric id
     * @param {number} id - tha item's ID.
     * @returns {Item | null} the item.
     */
    public getItemById(id: number): Item | null {
        return this.getItems().find((a) => a.getId() === id) ?? null;
    }

    /**
     * Get all items.
     * @returns {Item[]} all registered items.
     */
    public getItems(): Item[] {
        return Array.from(this.items.values());
    }

    /**
     * Register an item.
     * @param {Item} item - The item to be registered
     * @returns {Promise<void>} The promise.
     * @async
     */
    public registerItem = async (item: Item) => {
        const event = new ItemRegisterEvent(item);
        await this.server.emit('itemRegister', event);
        if (event.isCancelled()) return;

        this.server.getLogger().debug(`Item with id §b${item.getName()}§r registered`, 'ItemManager/registerClassItem');
        this.items.set(item.getName(), item);
    };

    /**
     * Register items exported by './Items'.
     */
    private async importItems() {
        const timer = new Timer();

        // Dynamically register blocks
        await Promise.all(Object.entries(Items).map(async ([, item]) => this.registerItem(new item())));

        this.server.getLogger().verbose(`Registered §b${this.items.size}§r item(s) (took §e${timer.stop()} ms§r)!`);
    }
}
