---
title: '@jsprismarine/native-worldgen errors'
description: The code, message and meaning of every error @jsprismarine/native-worldgen throws.
group: Documents
category: Errors
---

# @jsprismarine/native-worldgen errors

These are the errors `@jsprismarine/native-worldgen` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.native-worldgen -->
## `NATIVE_WORLDGEN_AQUIFER_NOT_CREATED`

`The native worldgen library could not create an aquifer`

Thrown as `NativeWorldgenErrors.AquiferNotCreated`, which extends `Error`.

The native library refused an aquifer: one of its programs was destroyed, its extent is
empty, its default fluid is not a fluid code, or memory ran out. The worldgen package only
hands over live programs and real extents, so this is a bug; report it.

## `NATIVE_WORLDGEN_CELL_BUFFER_TOO_SMALL`

`A cell program fill needs {cornerCount} corners and {size} outputs; it was given {corners} and {out}`

Thrown as `NativeWorldgenErrors.CellBufferTooSmall`, which extends `Error`.

A cell program was handed a corner buffer or an output buffer shorter than one fill reads or
writes; the C would read or write past its end. Size them from the program's `cornerCount`
and `size`.

## `NATIVE_WORLDGEN_CELL_PROGRAM_NOT_CREATED`

`The native worldgen library could not create a cell program of {nodes} nodes`

Thrown as `NativeWorldgenErrors.CellProgramNotCreated`, which extends `Error`.

The native library refused a cell program: a record names a node, constant or interpolated
cell that does not exist, runs a TypeScript fallback, or the cell holds more than 4096
values, or memory ran out. The worldgen package only hands over programs that fit, so this
is a bug; report it.

## `NATIVE_WORLDGEN_CLIMATE_TREE_NOT_CREATED`

`The native worldgen library could not create a climate tree of {nodes} nodes`

Thrown as `NativeWorldgenErrors.ClimateTreeNotCreated`, which extends `Error`.

The native library refused a climate search tree: a node names a child that does not exist,
or memory ran out. A tree the worldgen package flattened is never malformed, so this is a
bug; report it.

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

## `NATIVE_WORLDGEN_SURFACE_NOT_CREATED`

`The native worldgen library could not create a surface program`

Thrown as `NativeWorldgenErrors.SurfaceNotCreated`, which extends `Error`.

The native library refused a surface program: an op names a condition, state or vein that
does not exist or jumps outside the program, a biome set lies outside the bitsets, a vein's
program is destroyed, or memory ran out. The worldgen package lays out only whole programs,
so this is a bug; report it.
<!-- /fact -->
