import * as Items from './Items';

import type Item from './Item';
import ItemRegisterEvent from '../events/items/ItemRegisterEvent';
import type Server from '../Server';
import Timer from '../utils/Timer';

// TODO: Don't dynamically import, do it like ./network/Protocol etc
export default class ItemManager {
    private readonly server: Server;
    private readonly items = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook.
     */
    public async onEnable() {
        await this.importItems();
    }

    /**
     * OnDisable hook.
     */
    public async onDisable() {
        this.items.clear();
    }

    public getItem(name: string) {
        return this.items.get(name);
    }

    /**
     * Get item by numeric id
     */
    public getItemById(id: number): Item | null {
        return this.getItems().find((a) => a.getId() === id) ?? null;
    }

    /**
     * Get all items.
     *
     * @returns all registered items.
     */
    public getItems(): Item[] {
        return Array.from(this.items.values()) as Item[];
    }

    /**
     * Register an item.
     *
     * @param item - The item to be registered
     */
    public registerItem = async (item: Item) => {
        const event = new ItemRegisterEvent(item);
        await this.server.getEventManager().emit('itemRegister', event);
        if (event.isCancelled()) return;

        this.server
            .getLogger()
            ?.debug(`Item with id §b${item.getName()}§r registered`, 'ItemManager/registerClassItem');
        this.items.set(item.getName(), item);
    };

    /**
     * Register items exported by './Items'.
     */
    private async importItems() {
        const timer = new Timer();

        // Dynamically register blocks
        await Promise.all(Object.entries(Items).map(async ([, item]) => this.registerItem(new item())));

        this.server
            .getLogger()
            ?.verbose(
                `Registered §b${this.items.size}§r item(s) (took §e${timer.stop()} ms§r)!`,
                'ItemManager/importItems'
            );
    }
}
