---
title: '@jsprismarine/content errors'
description: The code, message and meaning of every error @jsprismarine/content throws.
group: Documents
category: Errors
---

# @jsprismarine/content errors

These are the errors `@jsprismarine/content` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.content -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class          | What its errors mean                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentError` | Every failure this package raises. A content failure is a load-time programming or data error, never a condition a tick loop recovers from, so the runtime fails the load instead of returning a sentinel. |
| `FlattenError` | Error thrown when a table cannot be flattened.                                                                                                                                                             |

## `CONTENT_BEHAVIOR_IS_ALREADY_REGISTERED`

`the behavior {name} is already registered`

Thrown as `ContentErrors.BehaviorIsAlreadyRegistered`, which extends `ContentError`.

Two behaviors were registered under the same name.

## `CONTENT_BEHAVIOR_UNDECLARED_HOOK`

`the behavior {name} returned a handler for {hook}, which it does not declare`

Thrown as `ContentErrors.BehaviorUndeclaredHook`, which extends `ContentError`.

A behavior returned a handler for a hook it did not list among its hooks. Add the hook to its
declaration.

## `CONTENT_COLUMN_VALUE_OUT_OF_RANGE`

`column {column} got {value} at id {id}, outside the {kind} range {min} to {max}`

Thrown as `ContentErrors.ColumnValueOutOfRange`, which extends `FlattenError`.

A content table's value does not fit the integer type of its column. The data is wrong, or
the column needs a wider type.

## `CONTENT_COLUMN_VALUE_TRUNCATED`

`column {column} got {value} at id {id}, which a {kind} array would truncate`

Thrown as `ContentErrors.ColumnValueTruncated`, which extends `FlattenError`.

A content table's value has a fraction, and its integer column would drop it.

## `CONTENT_COLUMN_VALUE_UNSTORABLE`

`column {column} got {value} at id {id}, which a {kind} array cannot hold`

Thrown as `ContentErrors.ColumnValueUnstorable`, which extends `FlattenError`.

A content table's value cannot be stored in its column's typed array, such as a non-number in
a numeric column.

## `CONTENT_COMPONENT_IS_ALREADY_REGISTERED`

`the component {name} is already registered`

Thrown as `ContentErrors.ComponentIsAlreadyRegistered`, which extends `ContentError`.

Two components were registered under the same name.

## `CONTENT_COMPONENT_UNDECLARED_HOOK`

`the component {name} returned a handler for {hook}, which it does not declare`

Thrown as `ContentErrors.ComponentUndeclaredHook`, which extends `ContentError`.

A component returned a handler for a hook it did not list among its hooks. Add the hook to
its declaration.

## `CONTENT_CONTENT_DID_NOT_RESOLVE_CLEANLY`

`the content did not resolve cleanly: {count} diagnostic(s), first: {first}`

Thrown as `ContentErrors.ContentDidNotResolveCleanly`, which extends `ContentError`.

A strict content load found problems. The error's `diagnostics` list every one, and the
message shows the first.

## `CONTENT_DUPLICATE_REGISTRY_KEY`

`the {name} registry got {key} twice in one build`

Thrown as `ContentErrors.DuplicateRegistryKey`, which extends `ContentError`.

A content registry was given the same key twice while it was built, such as two packs
defining one identifier in the same layer.

## `CONTENT_DUPLICATE_SOURCE_ID`

`two sources claim id {id}`

Thrown as `ContentErrors.DuplicateSourceId`, which extends `FlattenError`.

Two content sources asked for the same numeric id.

## `CONTENT_MISSING_COLUMN_VALUES`

`no value and no reviewed exception for {shown}{rest}`

Thrown as `ContentErrors.MissingColumnValues`, which extends `FlattenError`.

Some entries of a content table have no value for a column and no reviewed exception that
explains why. Supply the values, or record the gaps as reviewed exceptions.

## `CONTENT_NO_BEHAVIOR_IS_REGISTERED`

`no behavior is registered as {behaviorName}`

Thrown as `ContentErrors.NoBehaviorIsRegistered`, which extends `ContentError`.

A behavior was attached by a name nothing registered.

## `CONTENT_REGISTRY_HAS_NO_ENTRY`

`the {name} registry has no entry for {key}`

Thrown as `ContentErrors.RegistryHasNoEntry`, which extends `ContentError`.

A content registry was asked for a key nothing defines, such as an identifier no loaded pack
declares.

## `CONTENT_SOURCE_ID_OUT_OF_RANGE`

`a source claims id {id}, outside the 0 to {value} range`

Thrown as `ContentErrors.SourceIdOutOfRange`, which extends `FlattenError`.

A content source asked for a numeric id outside the table.

## `CONTENT_STALE_REVIEWED_EXCEPTIONS`

`reviewed exceptions matched nothing and should be removed: {shown}`

Thrown as `ContentErrors.StaleReviewedExceptions`, which extends `FlattenError`.

A content table lists reviewed exceptions for entries that now have values. Remove the stale
exceptions.
<!-- /fact -->
