---
title: '@jsprismarine/native-worldgen errors'
description: The code, message and meaning of every error @jsprismarine/native-worldgen throws.
group: Documents
category: Errors
---

# @jsprismarine/native-worldgen errors

These are the errors `@jsprismarine/native-worldgen` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.native-worldgen -->
## `NATIVE_WORLDGEN_INVALID_PERMUTATION_TABLE`

`Layer {layer} has a permutation table of {length} entries; a layer needs 256`

Thrown as `NativeWorldgenErrors.InvalidPermutationTable`, which extends `Error`.

A noise layer's permutation table must hold exactly 256 entries, as Java's does.

## `NATIVE_WORLDGEN_LIBRARY_DOES_NOT_LOAD`

`The native worldgen library at {path} does not load on {platform}-{arch}: {value}`

Thrown as `NativeWorldgenErrors.LibraryDoesNotLoad`, which extends `NativeLibraryError`.

The operating system refused to load the native worldgen library, usually because it was
built for another platform or misses a system library. The message ends with the loader's
reason.

## `NATIVE_WORLDGEN_LIBRARY_INTERFACE_MISMATCH`

`The native worldgen library at {path} speaks interface {version}; this package needs {abiVersion}`

Thrown as `NativeWorldgenErrors.LibraryInterfaceMismatch`, which extends `NativeLibraryError`.

The native worldgen library was built for a different version of this package. Reinstall the
package so the two match, or in a checkout, rebuild the library with `pnpm run build:native`
in `packages/native-worldgen`.

## `NATIVE_WORLDGEN_PROGRAM_NOT_CREATED`

`The native worldgen library could not create a density program of {nodes} nodes`

Thrown as `NativeWorldgenErrors.ProgramNotCreated`, which extends `Error`.

The native library refused a density program: a record names a node, constant, link, stack
or cache slot that does not exist, or memory ran out. A program the worldgen package
encoded is never malformed, so this is a bug; report it.

## `NATIVE_WORLDGEN_STACK_DESTROYED`

`The noise stack or density program was destroyed`

Thrown as `NativeWorldgenErrors.StackDestroyed`, which extends `Error`.

A noise stack or density program was used after `destroy()` freed it.

## `NATIVE_WORLDGEN_STACK_NOT_CREATED`

`The native worldgen library could not create a noise stack of {layers} layers`

Thrown as `NativeWorldgenErrors.StackNotCreated`, which extends `Error`.

The native library could not allocate a noise stack, because memory ran out or the address
it got does not fit in the handle a call passes back.
<!-- /fact -->
