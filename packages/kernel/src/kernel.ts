import type { EventBus, EventMap } from './events';
import { KernelEventBus } from './events';
import type { KernelLogger } from './logger';
import { consoleLogger, scopedLogger } from './logger';
import type { Module, ModuleContext } from './module';
import type { ServiceToken } from './token';

/**
 * Error raised for kernel contract violations: missing providers, dependency
 * cycles, duplicate providers, out-of-phase calls, and undeclared `use()`.
 */
export class KernelError extends Error {
    public override readonly name = 'KernelError';
}

/**
 * Options for constructing a kernel.
 */
export interface KernelOptions {
    /** Per-module configuration, keyed by module id. */
    readonly config?: Readonly<Record<string, unknown>>;
    /** Base logger; module loggers are scoped from it. Defaults to the console. */
    readonly logger?: KernelLogger;
}

type KernelPhase = 'created' | 'starting' | 'started' | 'stopped';

interface ModuleEntry<Events extends EventMap> {
    readonly module: Module<unknown, Events>;
    readonly context: ModuleContext<unknown, Events>;
    readonly dependencyIds: ReadonlySet<string>;
}

/**
 * The module kernel. It owns lifecycle, a token-keyed service registry, and the
 * event bus; everything else — worlds, sessions, commands, networking, the tick
 * loop — is a module.
 *
 * `start()` runs every module's `register()` phase, validates the dependency
 * graph, then runs `start()` phases in dependency order. `stop()` runs `stop()`
 * phases in reverse order, logging failures instead of throwing.
 */
export class Kernel<Events extends EventMap = EventMap> {
    private readonly entries: ModuleEntry<Events>[] = [];
    private readonly services = new Map<string, unknown>();
    private readonly providerOf = new Map<string, string>();
    private readonly bus = new KernelEventBus<Events>();
    private readonly config: Readonly<Record<string, unknown>>;
    private readonly logger: KernelLogger;
    private phase: KernelPhase = 'created';
    private registering: string | undefined;
    private startOrder: ModuleEntry<Events>[] = [];

    public constructor(options: KernelOptions = {}) {
        this.config = options.config ?? {};
        this.logger = options.logger ?? consoleLogger;
    }

    /** The kernel-owned event bus, unscoped. Module code should use its context's scoped handle. */
    public get events(): EventBus<Events> {
        return this.bus;
    }

    /**
     * Adds a module. Legal only before `start()`.
     *
     * @throws KernelError after `start()` or when a module with the same id is already registered.
     */
    public register<Config>(module: Module<Config, Events>): void {
        if (this.phase !== 'created') {
            throw new KernelError(`Cannot register module "${module.id}" after the kernel has started`);
        }
        if (this.entries.some((entry) => entry.module.id === module.id)) {
            throw new KernelError(`A module with id "${module.id}" is already registered`);
        }
        const dependencyIds = new Set((module.dependencies ?? []).map((token) => token.id));
        const entry: ModuleEntry<Events> = {
            module,
            dependencyIds,
            context: this.createContext(module.id, dependencyIds)
        };
        this.entries.push(entry);
    }

    /**
     * Runs all `register()` phases, validates providers and the dependency
     * graph, then runs `start()` phases in dependency order.
     *
     * @throws KernelError when a declared dependency has no provider or the dependency graph has a cycle.
     */
    public async start(): Promise<void> {
        if (this.phase !== 'created') {
            throw new KernelError(`Kernel can only start once (current phase: ${this.phase})`);
        }
        this.phase = 'starting';
        for (const entry of this.entries) {
            this.registering = entry.module.id;
            try {
                await entry.module.register(entry.context);
            } finally {
                this.registering = undefined;
            }
        }
        this.assertProvidersExist();
        this.startOrder = this.sortByDependencies();
        for (const entry of this.startOrder) {
            await entry.module.start?.(entry.context);
        }
        this.phase = 'started';
    }

    /**
     * Runs `stop()` phases in reverse start order and detaches each module's
     * event listeners. Failures are logged, not thrown, so one module cannot
     * block the others' teardown.
     */
    public async stop(): Promise<void> {
        if (this.phase === 'stopped') return;
        this.phase = 'stopped';
        for (const entry of [...this.startOrder].reverse()) {
            try {
                await entry.module.stop?.(entry.context);
            } catch (error) {
                this.logger.error(`Module "${entry.module.id}" failed to stop: ${error}`);
            } finally {
                this.bus.removeScope(entry.module.id);
            }
        }
    }

    /**
     * Resolves a service for the host or for tests. Module code should resolve
     * through its context instead.
     *
     * @throws KernelError when no module has provided the token.
     */
    public get<T>(token: ServiceToken<T>): T {
        if (!this.services.has(token.id)) {
            throw new KernelError(`No provider for service "${token.id}"`);
        }
        // The registry stores services untyped; the token's phantom type is the
        // contract that the provider stored a matching value.
        return this.services.get(token.id) as T;
    }

    private createContext(moduleId: string, dependencyIds: ReadonlySet<string>): ModuleContext<unknown, Events> {
        return {
            use: <T>(token: ServiceToken<T>): T => {
                if (!dependencyIds.has(token.id)) {
                    throw new KernelError(
                        `Module "${moduleId}" used service "${token.id}" without declaring it as a dependency`
                    );
                }
                if (!this.services.has(token.id)) {
                    throw new KernelError(
                        `Service "${token.id}" is not provided yet; resolve dependencies in start(), not register()`
                    );
                }
                return this.get(token);
            },
            provide: <T>(token: ServiceToken<T>, service: T, options?: { override?: boolean }): void => {
                if (this.registering !== moduleId) {
                    throw new KernelError(
                        `Module "${moduleId}" may only provide "${token.id}" during its register() phase`
                    );
                }
                const existing = this.providerOf.get(token.id);
                if (existing !== undefined && !options?.override) {
                    throw new KernelError(
                        `Service "${token.id}" is already provided by module "${existing}"; pass override: true to replace it`
                    );
                }
                this.services.set(token.id, service);
                this.providerOf.set(token.id, moduleId);
            },
            events: this.bus.scoped(moduleId),
            logger: scopedLogger(this.logger, moduleId),
            config: this.config[moduleId]
        };
    }

    private assertProvidersExist(): void {
        for (const entry of this.entries) {
            for (const tokenId of entry.dependencyIds) {
                if (!this.providerOf.has(tokenId)) {
                    throw new KernelError(
                        `Module "${entry.module.id}" depends on service "${tokenId}" but no registered module provides it`
                    );
                }
            }
        }
    }

    /**
     * Topologically sorts modules so providers start before their dependents,
     * preserving registration order among independent modules.
     */
    private sortByDependencies(): ModuleEntry<Events>[] {
        const byId = new Map(this.entries.map((entry) => [entry.module.id, entry]));
        const order: ModuleEntry<Events>[] = [];
        const state = new Map<string, 'visiting' | 'done'>();
        const visit = (entry: ModuleEntry<Events>, path: string[]): void => {
            const status = state.get(entry.module.id);
            if (status === 'done') return;
            if (status === 'visiting') {
                const cycle = [...path.slice(path.indexOf(entry.module.id)), entry.module.id];
                throw new KernelError(`Dependency cycle between modules: ${cycle.join(' -> ')}`);
            }
            state.set(entry.module.id, 'visiting');
            path.push(entry.module.id);
            for (const tokenId of entry.dependencyIds) {
                const providerId = this.providerOf.get(tokenId);
                if (providerId === undefined || providerId === entry.module.id) continue;
                const provider = byId.get(providerId);
                if (provider) visit(provider, path);
            }
            path.pop();
            state.set(entry.module.id, 'done');
            order.push(entry);
        };
        for (const entry of this.entries) {
            visit(entry, []);
        }
        return order;
    }
}
