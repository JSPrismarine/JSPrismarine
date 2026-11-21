---
title: '@jsprismarine/prismarine input errors'
description: The code, message and meaning of every error in the input catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine input errors

These are the errors in the `input` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.input -->
## `PRISMARINE_DUPLICATE_INTENT_HANDLER`

`An intent handler for {kind} already exists`

Thrown as `PrismarineInputErrors.DuplicateIntentHandler`, which extends `Error`.

Two handlers were registered for the same intent kind. A plugin that wants to add behavior
to an intent appends its handler instead of registering a second one.

## `PRISMARINE_INPUT_CONTEXT_WITHOUT_STEP`

`An input-lane intent handler was run outside an input step`

Thrown as `PrismarineInputErrors.InputContextWithoutStep`, which extends `Error`.

An input-lane intent handler was run with a context that has no input step, so it had
nowhere to hand a send. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_NO_INTENT_HANDLER`

`No handler is registered for the {kind} intent`

Thrown as `PrismarineInputErrors.NoIntentHandler`, which extends `Error`.

A decoder produced an intent whose kind has no handler. Every kind in the intent table has a
built-in handler, so this is a bug in the server; report it with the stack trace.

## `PRISMARINE_UNDECLARED_INTENT`

`The {packetName} decoder returned a {kind} intent it did not declare`

Thrown as `PrismarineInputErrors.UndeclaredIntent`, which extends `Error`.

A decoder returned an intent of a kind it did not declare, so the dispatcher may have run
it in a lane too loose for that kind. This is a bug in the decoder; its `intents` list has
to name every kind it returns.

## `PRISMARINE_UNKNOWN_INTENT_KIND`

`{kind} is not an intent kind`

Thrown as `PrismarineInputErrors.UnknownIntentKind`, which extends `Error`.

A decoder declared it may produce an intent kind the intent table does not have. This is a
bug in the server or a plugin; the decoder's `intents` list names the kinds it returns.
<!-- /fact -->
