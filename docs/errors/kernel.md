---
title: '@jsprismarine/kernel errors'
description: The code, message and meaning of every error @jsprismarine/kernel throws.
group: Documents
category: Errors
---

# @jsprismarine/kernel errors

These are the errors `@jsprismarine/kernel` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.kernel -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class         | What its errors mean                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KernelError` | Error raised for kernel contract violations: missing providers, dependency cycles, duplicate providers, out-of-phase calls, and undeclared `use()`. |

## `KERNEL_ALREADY_STARTED`

`Kernel is already {phase}; stop() it before starting again`

Thrown as `KernelErrors.AlreadyStarted`, which extends `KernelError`.

`start()` was called on a kernel that is already starting or started.

## `KERNEL_DEPENDENCY_CYCLE`

`Dependency cycle between modules: {cycle}`

Thrown as `KernelErrors.DependencyCycle`, which extends `KernelError`.

Modules depend on each other in a loop, so none can start first. The message lists the loop.

## `KERNEL_DUPLICATE_MODULE`

`A module with id "{id}" is already registered`

Thrown as `KernelErrors.DuplicateModule`, which extends `KernelError`.

Two modules share an id.

## `KERNEL_DUPLICATE_SERVICE_PROVIDER`

`Service "{id}" is already provided by module "{existing}"; pass override: true to replace it`

Thrown as `KernelErrors.DuplicateServiceProvider`, which extends `KernelError`.

A second module provided a service another already provides. Pass `override: true` if
replacing it is intended.

## `KERNEL_LATE_MODULE_REGISTRATION`

`Cannot register module "{id}" after the kernel has run registerAll()`

Thrown as `KernelErrors.LateModuleRegistration`, which extends `KernelError`.

A module was added after the kernel registered its modules. Add every module before
`start()`.

## `KERNEL_MISSING_SERVICE_PROVIDER`

`Module "{id}" depends on service "{tokenId}" but no registered module provides it`

Thrown as `KernelErrors.MissingServiceProvider`, which extends `KernelError`.

A module declares a dependency on a service no registered module provides. Register the
providing module, or drop the dependency.

## `KERNEL_NO_PROVIDER_FOR_SERVICE`

`No provider for service "{id}"`

Thrown as `KernelErrors.NoProviderForService`, which extends `KernelError`.

A service was resolved that no module provides.

## `KERNEL_PROVIDE_OUTSIDE_REGISTER`

`Module "{moduleId}" may only provide "{id}" during its register() phase`

Thrown as `KernelErrors.ProvideOutsideRegister`, which extends `KernelError`.

A module provided a service outside its own `register()`. Provide services there.

## `KERNEL_SERVICE_NOT_PROVIDED_YET`

`Service "{id}" is not provided yet; resolve dependencies in start(), not register()`

Thrown as `KernelErrors.ServiceNotProvidedYet`, which extends `KernelError`.

A module resolved a service during `register()`, before its provider ran. Resolve services in
`start()`.

## `KERNEL_STOPPED_DURING_START`

`Kernel was stopped before start() finished`

Thrown as `KernelErrors.StoppedDuringStart`, which extends `KernelError`.

The kernel was stopped while it was still starting, so the start gave up.

## `KERNEL_TOKEN_ID_NOT_NAMESPACED`

`Service token id must be namespaced as "namespace:name", got "{id}"`

Thrown as `KernelErrors.TokenIdNotNamespaced`, which extends `Error`.

A service token's id is not written as `namespace:name`.

## `KERNEL_UNDECLARED_SERVICE_USE`

`Module "{moduleId}" used service "{id}" without declaring it as a dependency`

Thrown as `KernelErrors.UndeclaredServiceUse`, which extends `KernelError`.

A module resolved a service it did not list among its dependencies, so the kernel cannot
order it after the provider. Add the service to its dependencies.

## `KERNEL_UNDECLARED_STUB`

`Stub for "{id}" is not in module "{moduleId}"'s declared dependencies`

Thrown as `KernelErrors.UndeclaredStub`, which extends `KernelError`.

A test stubbed a service the module under test does not depend on. Remove the stub, or
declare the dependency.
<!-- /fact -->
