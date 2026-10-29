import type { EventBus, EventMap } from './events';
import type { KernelLogger } from './logger';
import type { ServiceToken } from './token';

/**
 * Options for `ModuleContext.provide`.
 */
export interface ProvideOptions {
    /** Replace an existing provider for the same token instead of failing. */
    readonly override?: boolean;
}

/**
 * The kernel capabilities handed to one module. Everything a module reaches —
 * services, events, logging, configuration — flows through its context.
 */
export interface ModuleContext<Config = undefined, Events extends EventMap = EventMap> {
    /**
     * Resolves a service this module declared in `dependencies`.
     *
     * @throws KernelError when the token is not declared, or (during the
     * register phase) when its provider has not registered yet.
     */
    use<T>(token: ServiceToken<T>): T;
    /**
     * Publishes a service under a token. Legal only while this module's
     * `register()` runs.
     *
     * @throws KernelError outside the register phase, or when the token already
     * has a provider and `override` is not set.
     */
    provide<T>(token: ServiceToken<T>, service: T, options?: ProvideOptions): void;
    /**
     * Event bus handle scoped to this module: listeners registered here are
     * detached automatically when the module stops.
     */
    readonly events: EventBus<Events>;
    /** Logger pre-scoped with the module id. */
    readonly logger: KernelLogger;
    /** This module's slice of the kernel configuration, keyed by module id. */
    readonly config: Config;
}

/**
 * A unit the kernel manages. `register()` constructs and provides services (no
 * I/O); `start()` runs in dependency order and may open sockets, worlds, and
 * files; `stop()` runs in reverse order.
 */
export interface Module<Config = undefined, Events extends EventMap = EventMap> {
    /** Unique module id, also the key of its config slice. */
    readonly id: string;
    /** Tokens this module resolves with `use()`. The kernel orders start/stop from these. */
    readonly dependencies?: readonly ServiceToken<unknown>[];
    /** Phase 1: construct and `provide()` services. No I/O. */
    register(ctx: ModuleContext<Config, Events>): void | Promise<void>;
    /** Phase 2, in dependency order: open sockets, worlds, files. */
    start?(ctx: ModuleContext<Config, Events>): void | Promise<void>;
    /** Teardown, in reverse dependency order. */
    stop?(ctx: ModuleContext<Config, Events>): void | Promise<void>;
}
