---
title: '@jsprismarine/items errors'
description: The code, message and meaning of every error @jsprismarine/items throws.
group: Documents
category: Errors
---

# @jsprismarine/items errors

These are the errors `@jsprismarine/items` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.items -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                 | What its errors mean                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `NumberProviderError` | Error thrown when a provider definition is missing or has a node kind this module does not know. |

## `ITEMS_DIV_PROVIDER_DIVIDES_BY_ZERO`

`a div provider divides by zero`

Thrown as `ItemsErrors.DivProviderDividesByZero`, which extends `NumberProviderError`.

A number provider divides by a value that evaluated to zero. Fix the provider in the pack
that defines it.

## `ITEMS_IS_NOT_NUMBER_PROVIDER`

`{node} is not a number provider`

Thrown as `ItemsErrors.IsNotNumberProvider`, which extends `NumberProviderError`.

A pack gave something that is neither a number nor a number provider object where a number
provider belongs.

## `ITEMS_NO_CONTEXT_PROVIDER_IS_KNOWN`

`no context provider is known as {node}`

Thrown as `ItemsErrors.NoContextProviderIsKnown`, which extends `NumberProviderError`.

A pack names a context value that no number provider reads, such as a misspelled name.

## `ITEMS_UNKNOWN_NUMBER_PROVIDER_KIND`

`unknown number provider kind {type}`

Thrown as `ItemsErrors.UnknownNumberProviderKind`, which extends `NumberProviderError`.

A number provider's `type` is one this server does not implement.

## `ITEMS_WEIGHTED_LIST_PROVIDER_HAS_NO_WEIGHT`

`a weighted list provider has no weight`

Thrown as `ItemsErrors.WeightedListProviderHasNoWeight`, which extends `NumberProviderError`.

A weighted list number provider's weights add up to zero, so it cannot pick anything.
<!-- /fact -->
