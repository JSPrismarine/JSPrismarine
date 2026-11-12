/**
 * Maps event names to the argument tuples their listeners receive. Hosts extend
 * this by declaring their own map and passing it as the kernel's `Events`
 * generic.
 */
export type EventMap = Record<string, readonly unknown[]>;

/**
 * A listener for one event. `emit` awaits a returned promise; `post` does not, and reports its
 * rejection. Any other value a listener returns is ignored.
 */
export type EventListener<Args extends readonly unknown[]> = (...args: Args) => unknown;

/**
 * Where a bus reports a listener that threw or rejected.
 * @param error - What the listener threw, or the reason its promise rejected.
 * @param event - The event the listener was called for.
 */
export type ListenerErrorHandler = (error: unknown, event: string) => void;

/**
 * The typed event bus the kernel owns.
 *
 * Listeners run in subscription order. A listener that throws or rejects is
 * reported to the bus's {@link ListenerErrorHandler} and stops nothing: the
 * listeners after it still run, and neither `post` nor `emit` throws. Subscribing
 * the same function to the same event twice through one handle subscribes it once.
 */
export interface EventBus<Events extends EventMap = EventMap> {
    /**
     * Subscribes to an event.
     *
     * @returns A function that removes this subscription.
     */
    on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void;
    /**
     * Subscribes to the next occurrence of an event only. The subscription is
     * removed before the listener is called.
     *
     * @returns A function that removes this subscription.
     */
    once<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void;
    /**
     * Removes a listener this handle subscribed to an event, whether through
     * `on` or `once`. Does nothing when it is not subscribed.
     */
    off<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): void;
    /**
     * Removes every subscription this handle made, to one event or to all of them.
     */
    removeAll(event?: keyof Events & string): void;
    /** Whether an event has at least one listener, from any handle. */
    hasListeners(event: keyof Events & string): boolean;
    /**
     * Calls each listener of an event in subscription order and returns without
     * waiting for any of them. What an asynchronous listener does after its first
     * wait runs later, and its rejection is reported.
     *
     * @returns How many listeners were called.
     */
    post<K extends keyof Events & string>(event: K, ...args: Events[K]): number;
    /**
     * Calls each listener of an event in subscription order, waiting for each one
     * before it calls the next.
     */
    emit<K extends keyof Events & string>(event: K, ...args: Events[K]): Promise<void>;
}

/**
 * Options for constructing a {@link KernelEventBus}.
 */
export interface KernelEventBusOptions {
    /** Where a failing listener is reported. Defaults to `console.error`. */
    readonly onListenerError?: ListenerErrorHandler;
}

interface Subscription {
    readonly listener: EventListener<readonly unknown[]>;
    readonly scope: string | undefined;
    readonly once: boolean;
}

/**
 * The kernel's event bus. Listeners can be tagged with a scope (a module id)
 * and detached wholesale when that module stops.
 */
export class KernelEventBus<Events extends EventMap = EventMap> implements EventBus<Events> {
    private readonly subscriptions = new Map<string, Set<Subscription>>();
    private readonly onListenerError: ListenerErrorHandler;

    public constructor(options: KernelEventBusOptions = {}) {
        this.onListenerError =
            options.onListenerError ?? ((error, event) => console.error(`A "${event}" listener failed:`, error));
    }

    /** Subscribes without a scope. See `EventBus.on`. */
    public on<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void {
        return this.subscribe(event, listener, undefined, false);
    }

    /** Subscribes once without a scope. See `EventBus.once`. */
    public once<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): () => void {
        return this.subscribe(event, listener, undefined, true);
    }

    /** Removes an unscoped subscription. See `EventBus.off`. */
    public off<K extends keyof Events & string>(event: K, listener: EventListener<Events[K]>): void {
        this.unsubscribe(event, listener, undefined);
    }

    /** Removes the unscoped subscriptions. See `EventBus.removeAll`. */
    public removeAll(event?: keyof Events & string): void {
        this.removeMatching(event, undefined);
    }

    /** See `EventBus.hasListeners`. */
    public hasListeners(event: keyof Events & string): boolean {
        return (this.subscriptions.get(event)?.size ?? 0) > 0;
    }

    /** See `EventBus.post`. */
    public post<K extends keyof Events & string>(event: K, ...args: Events[K]): number {
        const subscriptions = this.listenersOf(event);
        for (const subscription of subscriptions) {
            const result = this.call(event, subscription, args);
            if (result instanceof Promise) result.catch((error: unknown) => this.onListenerError(error, event));
        }
        return subscriptions.length;
    }

    /** See `EventBus.emit`. */
    public async emit<K extends keyof Events & string>(event: K, ...args: Events[K]): Promise<void> {
        for (const subscription of this.listenersOf(event)) {
            try {
                await this.call(event, subscription, args);
            } catch (error) {
                this.onListenerError(error, event);
            }
        }
    }

    /**
     * Returns a view of this bus whose subscriptions are tagged with the scope,
     * so `removeScope` can detach them all at once.
     */
    public scoped(scope: string): EventBus<Events> {
        return {
            on: (event, listener) => this.subscribe(event, listener, scope, false),
            once: (event, listener) => this.subscribe(event, listener, scope, true),
            off: (event, listener) => this.unsubscribe(event, listener, scope),
            removeAll: (event) => this.removeMatching(event, scope),
            hasListeners: (event) => this.hasListeners(event),
            post: (event, ...args) => this.post(event, ...args),
            emit: (event, ...args) => this.emit(event, ...args)
        };
    }

    /**
     * Removes every subscription tagged with the scope.
     */
    public removeScope(scope: string): void {
        for (const event of [...this.subscriptions.keys()]) this.removeMatching(event, scope);
    }

    /** A copy of an event's subscriptions, so a listener that subscribes or unsubscribes skips no one. */
    private listenersOf(event: string): Subscription[] {
        const subscriptions = this.subscriptions.get(event);
        return subscriptions === undefined ? [] : [...subscriptions];
    }

    /**
     * Calls one listener and reports what it throws, returning what it returned. A `once`
     * subscription is removed first, so a listener that raises its own event is not called again.
     */
    private call(event: string, subscription: Subscription, args: readonly unknown[]): unknown {
        if (subscription.once) this.subscriptions.get(event)?.delete(subscription);
        try {
            return subscription.listener(...args);
        } catch (error) {
            this.onListenerError(error, event);
            return undefined;
        }
    }

    private subscribe<K extends keyof Events & string>(
        event: K,
        listener: EventListener<Events[K]>,
        scope: string | undefined,
        once: boolean
    ): () => void {
        let subscriptions = this.subscriptions.get(event);
        if (!subscriptions) {
            subscriptions = new Set();
            this.subscriptions.set(event, subscriptions);
        }
        const existing = [...subscriptions].find((entry) => entry.listener === listener && entry.scope === scope);
        // Storage erases the per-event tuple type; the dispatchers are the only callers and pass
        // the matching event's arguments.
        const subscription: Subscription = existing ?? {
            listener: listener as EventListener<readonly unknown[]>,
            scope,
            once
        };
        subscriptions.add(subscription);
        return () => {
            subscriptions.delete(subscription);
        };
    }

    private unsubscribe(event: string, listener: unknown, scope: string | undefined): void {
        const subscriptions = this.subscriptions.get(event);
        if (!subscriptions) return;
        for (const subscription of subscriptions) {
            if (subscription.listener === listener && subscription.scope === scope) subscriptions.delete(subscription);
        }
        if (subscriptions.size === 0) this.subscriptions.delete(event);
    }

    /** Removes the subscriptions of one scope, or the unscoped ones, from one event or every event. */
    private removeMatching(event: string | undefined, scope: string | undefined): void {
        for (const name of event === undefined ? [...this.subscriptions.keys()] : [event]) {
            const subscriptions = this.subscriptions.get(name);
            if (!subscriptions) continue;
            for (const subscription of subscriptions) {
                if (subscription.scope === scope) subscriptions.delete(subscription);
            }
            if (subscriptions.size === 0) this.subscriptions.delete(name);
        }
    }
}
