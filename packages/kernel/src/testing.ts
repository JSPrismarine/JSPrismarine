import type { EventBus, EventMap } from './events';
import { Kernel, KernelError } from './kernel';
import type { KernelLogger } from './logger';
import type { Module } from './module';
import type { ServiceToken } from './token';

/**
 * A stub provider for one declared dependency of the module under test. Create
 * with `stubService` to keep the service typed against its token.
 */
export interface ServiceStub {
    /** Token the stub provides. */
    readonly token: ServiceToken<unknown>;
    /** The stub implementation. */
    readonly service: unknown;
}

/**
 * Pairs a token with a stub implementation, checking the stub against the
 * token's service type.
 */
export function stubService<T>(token: ServiceToken<T>, service: T): ServiceStub {
    return { token, service };
}

/**
 * Options for `startTestModule`.
 */
export interface TestModuleOptions<Config> {
    /** Stub providers, one per declared dependency of the module under test. */
    readonly stubs?: readonly ServiceStub[];
    /** The module's config slice. */
    readonly config?: Config;
    /** Logger for the kernel; defaults to the console. */
    readonly logger?: KernelLogger;
}

/**
 * Handle over the started single-module kernel.
 */
export interface TestModuleHandle<Events extends EventMap> {
    /** The kernel hosting the module under test and its stubs. */
    readonly kernel: Kernel<Events>;
    /** The kernel's event bus, for emitting events at the module under test. */
    readonly events: EventBus<Events>;
    /** Resolves a service from the kernel, e.g. one the module provided. */
    get<T>(token: ServiceToken<T>): T;
    /** Stops the kernel. Call `start()` afterwards to exercise a restart. */
    stop(): Promise<void>;
    /** Starts the kernel again after `stop()`, without rerunning register phases. */
    start(): Promise<void>;
}

/**
 * Starts one module against a kernel containing only its declared dependencies,
 * each backed by a caller-supplied stub. Because undeclared `use()` throws and
 * missing providers fail `start()`, a test using this helper fails when the
 * module's dependency list drifts from the services it actually uses.
 *
 * @throws KernelError when a stub's token is not in the module's declared
 * dependencies (the stub is stale) or when a declared dependency has no stub.
 */
export async function startTestModule<Config, Events extends EventMap>(
    module: Module<Config, Events>,
    options: TestModuleOptions<Config> = {}
): Promise<TestModuleHandle<Events>> {
    const declared = new Set((module.dependencies ?? []).map((token) => token.id));
    const kernel = new Kernel<Events>({
        config: options.config === undefined ? {} : { [module.id]: options.config },
        logger: options.logger
    });
    for (const stub of options.stubs ?? []) {
        if (!declared.has(stub.token.id)) {
            throw new KernelError(
                `Stub for "${stub.token.id}" is not in module "${module.id}"'s declared dependencies`
            );
        }
        kernel.register({
            id: `test:stub/${stub.token.id}`,
            register: (ctx) => {
                ctx.provide(stub.token, stub.service);
            }
        });
    }
    kernel.register(module);
    await kernel.start();
    return {
        kernel,
        events: kernel.events,
        get: (token) => kernel.get(token),
        stop: () => kernel.stop(),
        start: () => kernel.start()
    };
}
