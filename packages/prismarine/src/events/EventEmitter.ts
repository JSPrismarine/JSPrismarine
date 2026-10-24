import type BlockRegisterEvent from './block/BlockRegisterEvent';
import type ChatEvent from './chat/ChatEvent';
import type CommandRegisterEvent from './command/CommandRegisterEvent';
import type RecipeRegisterEvent from './crafting/RecipeRegisterEvent';
import type EntityDamageEvent from './entity/EntityDamageEvent';
import type EntityDeathEvent from './entity/EntityDeathEvent';
import type ItemRegisterEvent from './items/ItemRegisterEvent';
import type PlayerConnectEvent from './player/PlayerConnectEvent';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent';
import type PlayerMoveEvent from './player/PlayerMoveEvent';
import type PlayerSetGamemodeEvent from './player/PlayerSetGamemodeEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';
import type PlayerToggleFlightEvent from './player/PlayerToggleFlightEvent';
import type PlayerToggleSprintEvent from './player/PlayerToggleSprintEvent';
import type RaknetConnectEvent from './raknet/RaknetConnectEvent';
import type RaknetDisconnectEvent from './raknet/RaknetDisconnectEvent';
import type RaknetEncapsulatedPacketEvent from './raknet/RaknetEncapsulatedPacketEvent';
import type { TickEvent } from './Events';
import type playerToggleOperatorEvent from './player/PlayerToggleOperatorEvent';

export type EventTypes =
    | ['blockRegister', BlockRegisterEvent]
    | ['chat', ChatEvent]
    | ['commandRegister', CommandRegisterEvent]
    | ['itemRegister', ItemRegisterEvent]
    | ['recipeRegister', RecipeRegisterEvent]
    | ['tick', TickEvent]
    | ['entityDamage', EntityDamageEvent]
    | ['entityDeath', EntityDeathEvent]
    | ['playerConnect', PlayerConnectEvent]
    | ['playerDisconnect', PlayerDisconnectEvent]
    | ['playerSpawn', PlayerSpawnEvent]
    | ['playerDespawn', PlayerDespawnEvent]
    | ['playerMove', PlayerMoveEvent]
    | ['playerToggleFlight', PlayerToggleFlightEvent]
    | ['playerToggleSprint', PlayerToggleSprintEvent]
    | ['playerToggleOperator', playerToggleOperatorEvent]
    | ['playerSetGamemode', PlayerSetGamemodeEvent]
    | ['raknetConnect', RaknetConnectEvent]
    | ['raknetDisconnect', RaknetDisconnectEvent]
    | ['raknetEncapsulatedPacket', RaknetEncapsulatedPacketEvent];

type Listener = (event: any) => unknown;

/**
 * Listener bookkeeping shared by the event buses below. Not generic on purpose: ahead-of-time
 * compilation lowers plain classes, and the buses add the typing on top by delegation.
 */
class ListenerRegistry {
    private readonly listeners = new Map<string, Set<Listener>>();
    private readonly onceWrappers = new Map<Listener, Listener>();

    public add(id: string, listener: Listener): void {
        let set = this.listeners.get(id);
        if (!set) {
            set = new Set();
            this.listeners.set(id, set);
        }
        set.add(listener);
    }

    public addOnce(id: string, listener: Listener): void {
        const wrapper: Listener = (event) => {
            this.remove(id, listener);
            return listener(event);
        };
        this.onceWrappers.set(listener, wrapper);
        this.add(id, wrapper);
    }

    public remove(id: string, listener: Listener): void {
        const set = this.listeners.get(id);
        if (!set) return;
        set.delete(listener);
        const wrapper = this.onceWrappers.get(listener);
        if (wrapper) {
            set.delete(wrapper);
            this.onceWrappers.delete(listener);
        }
        if (set.size === 0) this.listeners.delete(id);
    }

    public removeAll(id?: string): void {
        if (id === undefined) {
            this.listeners.clear();
            this.onceWrappers.clear();
        } else {
            this.listeners.delete(id);
        }
    }

    /** Calls every listener of the event; the results are what the listeners returned. */
    public call(id: string, event: unknown): unknown[] {
        const set = this.listeners.get(id);
        if (!set) return [];
        // Copied first so a listener removing itself (or another) does not skip anyone.
        return [...set].map((listener) => listener(event));
    }
}

/** Events plugins define themselves: string ids with untyped payloads. */
export class PluginEventEmitter {
    private readonly registry = new ListenerRegistry();

    public on(id: string, callback: (event: any) => void): this {
        this.registry.add(id, callback);
        return this;
    }

    public once(id: string, callback: (event: any) => void): this {
        this.registry.addOnce(id, callback);
        return this;
    }

    public removeListener(id: string, callback: (event: any) => void): this {
        this.registry.remove(id, callback);
        return this;
    }

    public removeAllListeners(id?: string): this {
        this.registry.removeAll(id);
        return this;
    }

    public async emit(id: string, event: unknown): Promise<void> {
        await Promise.all(this.registry.call(id, event));
    }

    public post(pair: [string, any]): number {
        return this.registry.call(pair[0], pair[1]).length;
    }
}

/**
 * The server's event bus, keyed by the first element of each `[id, event]` pair in
 * {@link EventTypes}, with a second bus for the events plugins define themselves.
 */
export class EventEmitter {
    /** Events emitted by plugin makers. We can only listen those event
     * from within the server implementation, we are not supposed to post.
     * Also we can't have static typing for those as they are defined by
     * the plugin makers
     */
    public readonly evtThirdParty = new PluginEventEmitter();

    private readonly registry = new ListenerRegistry();

    public on<T extends EventTypes, K extends T[0]>(
        id: K,
        callback: (event: T extends readonly [K, infer U] ? U : never) => void
    ): this {
        this.registry.add(id, callback as Listener);
        return this;
    }

    public once<T extends EventTypes, K extends T[0]>(
        id: K,
        callback: (event: T extends readonly [K, infer U] ? U : never) => void
    ): this {
        this.registry.addOnce(id, callback as Listener);
        return this;
    }

    public removeListener<T extends EventTypes, K extends T[0]>(
        id: K,
        callback: (event: T extends readonly [K, infer U] ? U : never) => void
    ): this {
        this.registry.remove(id, callback as Listener);
        return this;
    }

    public removeAllListeners(id?: EventTypes[0]): this {
        this.registry.removeAll(id);
        return this;
    }

    /**
     * Calls every listener of the event and resolves once the asynchronous ones have settled.
     */
    public async emit<T extends EventTypes, K extends T[0]>(
        id: K,
        event: T extends readonly [K, infer U] ? U : never
    ): Promise<void> {
        await Promise.all(this.registry.call(id, event));
    }

    /**
     * Calls every listener of the event without waiting for the asynchronous ones.
     * @returns How many listeners received the event.
     */
    public post(pair: EventTypes): number {
        return this.registry.call(pair[0], pair[1]).length;
    }
}
