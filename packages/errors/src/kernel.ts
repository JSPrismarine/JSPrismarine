import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/**
 * Error raised for kernel contract violations: missing providers, dependency
 * cycles, duplicate providers, out-of-phase calls, and undeclared `use()`.
 */
export abstract class KernelError extends JSPrismarineError {
    public override name = 'KernelError';
}

/** The errors `@jsprismarine/kernel` throws. */
export const KernelErrors = defineErrors('kernel', {
    /**
     * A module was added after the kernel registered its modules. Add every module before
     * `start()`.
     */
    LateModuleRegistration: {
        message: 'Cannot register module "{id}" after the kernel has run registerAll()',
        base: KernelError
    },
    /**
     * Modules depend on each other in a loop, so none can start first. The message lists the loop.
     */
    DependencyCycle: { message: 'Dependency cycle between modules: {cycle}', base: KernelError },
    /** `start()` was called on a kernel that is already starting or started. */
    AlreadyStarted: {
        message: 'Kernel is already {phase}; stop() it before starting again',
        base: KernelError
    },
    /**
     * A module declares a dependency on a service no registered module provides. Register the
     * providing module, or drop the dependency.
     */
    MissingServiceProvider: {
        message: 'Module "{id}" depends on service "{tokenId}" but no registered module provides it',
        base: KernelError
    },
    /** A module provided a service outside its own `register()`. Provide services there. */
    ProvideOutsideRegister: {
        message: 'Module "{moduleId}" may only provide "{id}" during its register() phase',
        base: KernelError
    },
    /**
     * A module resolved a service it did not list among its dependencies, so the kernel cannot
     * order it after the provider. Add the service to its dependencies.
     */
    UndeclaredServiceUse: {
        message: 'Module "{moduleId}" used service "{id}" without declaring it as a dependency',
        base: KernelError
    },
    /** Two modules share an id. */
    DuplicateModule: { message: 'A module with id "{id}" is already registered', base: KernelError },
    /** A service was resolved that no module provides. */
    NoProviderForService: { message: 'No provider for service "{id}"', base: KernelError },
    /**
     * A second module provided a service another already provides. Pass `override: true` if
     * replacing it is intended.
     */
    DuplicateServiceProvider: {
        message: 'Service "{id}" is already provided by module "{existing}"; pass override: true to replace it',
        base: KernelError
    },
    /**
     * A module resolved a service during `register()`, before its provider ran. Resolve services in
     * `start()`.
     */
    ServiceNotProvidedYet: {
        message: 'Service "{id}" is not provided yet; resolve dependencies in start(), not register()',
        base: KernelError
    },
    /** A service token's id is not written as `namespace:name`. */
    TokenIdNotNamespaced: 'Service token id must be namespaced as "namespace:name", got "{id}"',
    /**
     * A test stubbed a service the module under test does not depend on. Remove the stub, or
     * declare the dependency.
     */
    UndeclaredStub: {
        message: 'Stub for "{id}" is not in module "{moduleId}"\'s declared dependencies',
        base: KernelError
    },
    /** The kernel was stopped while it was still starting, so the start gave up. */
    StoppedDuringStart: { message: 'Kernel was stopped before start() finished', base: KernelError }
});
