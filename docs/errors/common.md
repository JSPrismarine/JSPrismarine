---
title: 'Shared errors'
description: The code, message and meaning of every error any package may raise.
group: Documents
category: Errors
---

# Shared errors

These errors are not tied to one package: any package may raise them. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.common -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class     | What its errors mean |
| --------- | -------------------- |
| `asError` |                      |

## `COMMON_THROWN_VALUE`

`{value}`

Thrown as `CommonErrors.ThrownValue`, which extends `Error`.

Something threw or rejected with a value that is not an `Error`, such as a string, and the
code that caught it needed an `Error`. The message is the value as text.
<!-- /fact -->
