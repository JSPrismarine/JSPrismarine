/**
 * Items by name, over whichever registry the server has.
 *
 * The counterpart to `BlockManager`, and thin for the same reason: the names
 * come from `ServerContent`'s item registry, and from Java's committed item
 * table for a server that hands over no content build at all, which is a test
 * double. Both carry the 122 data components, so there is nothing for a class
 * to add.
 */
import type Server from '../Server';
import type { ServerContent } from '../content/ServerContent';
import ItemRegisterEvent from '../events/items/ItemRegisterEvent';
import Timer from '../utils/Timer';
import { Item } from './Item';
import { vanillaItemTypes } from './vanillaItemTypes';

/** The part of the server the item manager uses. */
export type ItemManagerServer = Pick<Server, 'getLogger' | 'emit'> & {
    getContent?(): ServerContent | undefined;
};

export default class ItemManager {
    private readonly server: ItemManagerServer;
    /** Items a plugin registered, which win over the registry's own. */
    private readonly registered = new Map<string, Item>();

    public constructor(server: ItemManagerServer) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().verbose(`Serving §b${this.names().length}§r item(s) (took §e${timer.stop()} ms§r)!`);
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.registered.clear();
    }

    /**
     * The content build, which a running server always has.
     *
     * Undefined only for a server double that leaves `getContent` out, and that is what the
     * fallback to Java's committed item table below is for.
     */
    private content(): ServerContent | undefined {
        return this.server.getContent?.();
    }

    /** Every item name the server can hand out. */
    private names(): readonly string[] {
        const content = this.content();
        const names = content ? [...content.items.types.keys()] : [...vanillaItemTypes().keys()];
        return [...new Set([...names, ...this.registered.keys()])];
    }

    /**
     * An item by its name.
     * @returns The item, or null when no registry names it.
     */
    public getItem(name: string): Item | null {
        const plugin = this.registered.get(name);
        if (plugin) return plugin;

        const content = this.content();
        if (content) return content.items.types.has(name) ? new Item({ name, content }) : null;

        return vanillaItemTypes().has(name) ? new Item({ name }) : null;
    }

    /** Every item the server can hand out, one stack each. */
    public getItems(): Item[] {
        const content = this.content();
        return this.names().map((name) => this.registered.get(name) ?? new Item({ name, content }));
    }

    /**
     * Register an item, which is how a plugin contributes one.
     *
     * @deprecated Ship a Bedrock behavior pack that defines the item and register the behavior
     * families its components name. Items come from the pack stack, so an `Item` registered here
     * has no component list, no hooks and no entry in the item fact tables, and the one thing it
     * can still do is answer for its own identifier ahead of the stack's. This method is removed
     * in a later release; see
     * [the migration plan](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/plans/data-driven-vanilla.md)
     * section 10.
     * @param item - The item, which answers for its name ahead of the registry's own.
     */
    public registerItem = async (item: Item): Promise<void> => {
        const event = new ItemRegisterEvent(item);
        await this.server.emit('itemRegister', event);
        if (event.isCanceled()) return;

        this.server.getLogger().debug(`Item with id §b${item.getName()}§r registered`, 'ItemManager/registerItem');
        this.registered.set(item.getName(), item);
    };
}
