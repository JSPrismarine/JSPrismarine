---
title: '@jsprismarine/engine-systems errors'
description: The code, message and meaning of every error @jsprismarine/engine-systems throws.
group: Documents
category: Errors
---

# @jsprismarine/engine-systems errors

These are the errors `@jsprismarine/engine-systems` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.engine-systems -->
## `ENGINE_SYSTEMS_INVALID_RANDOM_TICK_STATE`

`Random tick state must be a signed 32-bit integer`

Thrown as `EngineSystemsErrors.InvalidRandomTickState`, which extends `RangeError`.

A saved random tick state is not a signed 32-bit integer, so the save or the replay that
holds it is damaged.
<!-- /fact -->
