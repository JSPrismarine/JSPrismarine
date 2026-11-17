---
title: '@jsprismarine/block-behaviors errors'
description: The code, message and meaning of every error @jsprismarine/block-behaviors throws.
group: Documents
category: Errors
---

# @jsprismarine/block-behaviors errors

These are the errors `@jsprismarine/block-behaviors` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.block-behaviors -->
## `BLOCK_BEHAVIORS_BLOCK_PROPERTIES_DEFAULTS_REJECTED`

`the block properties schema rejected its own defaults: {message}`

Thrown as `BlockBehaviorsErrors.BlockPropertiesDefaultsRejected`, which extends `Error`.

The `jsprismarine:block_properties` component's schema refused the defaults it is built with.
This is a bug in `@jsprismarine/block-behaviors`; report it with the message.
<!-- /fact -->
