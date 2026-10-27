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
import Timer from '../utils/Timer';
import { Item } from './Item';
import { vanillaItemTypes } from './vanillaItemTypes';

/** The part of the server the item manager uses. */
export type ItemManagerServer = Pick<Server, 'getLogger'> & {
    getContent?(): ServerContent | undefined;
};

export default class ItemManager {
    private readonly server: ItemManagerServer;

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
        return content ? [...content.items.types.keys()] : [...vanillaItemTypes().keys()];
    }

    /**
     * An item by its name.
     * @returns The item, or null when no registry names it.
     */
    public getItem(name: string): Item | null {
        const content = this.content();
        if (content) return content.items.types.has(name) ? new Item({ name, content }) : null;

        return vanillaItemTypes().has(name) ? new Item({ name }) : null;
    }

    /** Every item the server can hand out, one stack each. */
    public getItems(): Item[] {
        const content = this.content();
        return this.names().map((name) => new Item({ name, content }));
    }
}
