/**
 * Maps event names to the argument tuples their listeners receive. Hosts extend
 * this by declaring their own map and passing it as the kernel's `Events`
 * generic.
 */
export type EventMap = Record<string, readonly unknown[]>;

/**
 * A listener for one event. A returned promise is awaited by `emit`.
 */
export type EventListener<Args extends readonly unknown[]> = (...args: Args) => void | Promise<void>;

/**
 * The minimal typed emitter the kernel owns. Prismarine's richer `EventEmitter`
 * is adapted to this interface in a later phase; keep this surface small.
 */
export interface EventBus<Events extends EventMap = EventMap> {
    /**
     * Subscribes to an event.
     *
     * @returns A function that removes this subscription.
     */
    on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void;
    /**
     * Emits an event, awaiting each listener in subscription order.
     */
    emit<K extends keyof Events & string>(event: K, ...args: Events[K]): Promise<void>;
}

interface Subscription {
    readonly listener: EventListener<readonly unknown[]>;
    readonly scope: string | undefined;
}

/**
 * The kernel's event bus. Listeners can be tagged with a scope (a module id)
 * and detached wholesale when that module stops.
 */
export class KernelEventBus<Events extends EventMap = EventMap> implements EventBus<Events> {
    private readonly subscriptions = new Map<string, Set<Subscription>>();

    /** Subscribes without a scope. See `EventBus.on`. */
    public on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void {
        return this.subscribe(event, listener, undefined);
    }

    /** Emits an event, awaiting each listener in subscription order. */
    public async emit<K extends keyof Events & string>(event: K, ...args: Events[K]): Promise<void> {
        const subscriptions = this.subscriptions.get(event);
        if (!subscriptions) return;
        for (const subscription of [...subscriptions]) {
            await subscription.listener(...args);
        }
    }

    /**
     * Returns a view of this bus whose subscriptions are tagged with the scope,
     * so `removeScope` can detach them all at once.
     */
    public scoped(scope: string): EventBus<Events> {
        return {
            on: (event, listener) => this.subscribe(event, listener, scope),
            emit: (event, ...args) => this.emit(event, ...args)
        };
    }

    /**
     * Removes every subscription tagged with the scope.
     */
    public removeScope(scope: string): void {
        for (const [event, subscriptions] of this.subscriptions) {
            for (const subscription of subscriptions) {
                if (subscription.scope === scope) subscriptions.delete(subscription);
            }
            if (subscriptions.size === 0) this.subscriptions.delete(event);
        }
    }

    private subscribe<K extends keyof Events & string>(
        event: K,
        listener: EventListener<Events[K]>,
        scope: string | undefined
    ): () => void {
        let subscriptions = this.subscriptions.get(event);
        if (!subscriptions) {
            subscriptions = new Set();
            this.subscriptions.set(event, subscriptions);
        }
        // Storage erases the per-event tuple type; `emit` is the only caller and
        // passes the matching event's arguments.
        const subscription: Subscription = { listener: listener as EventListener<readonly unknown[]>, scope };
        subscriptions.add(subscription);
        return () => {
            subscriptions.delete(subscription);
        };
    }
}
