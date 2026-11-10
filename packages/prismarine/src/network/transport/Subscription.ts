/** A subscription's listener, which may be asynchronous. */
export type Listener<Args extends unknown[]> = (...args: Args) => Promise<void> | void;

/**
 * The listeners of one transport event, run in the order they subscribed, each awaited before
 * the next. A transport holds one per event it offers.
 * @typeParam Args - What each listener is called with.
 */
export class Subscription<Args extends unknown[]> {
    private readonly listeners: Listener<Args>[] = [];

    /** Adds a listener after the ones already subscribed. */
    public add(listener: Listener<Args>): void {
        this.listeners.push(listener);
    }

    /**
     * Calls every listener in turn.
     * @param args - What each listener is called with.
     */
    public async deliver(...args: Args): Promise<void> {
        for (const listener of this.listeners) await listener(...args);
    }
}
