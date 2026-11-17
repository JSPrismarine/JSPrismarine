---
title: '@jsprismarine/binaryutils errors'
description: The code, message and meaning of every error @jsprismarine/binaryutils throws.
group: Documents
category: Errors
---

# @jsprismarine/binaryutils errors

These are the errors `@jsprismarine/binaryutils` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.binaryutils -->
## `BINARYUTILS_END_OF_BUFFER`

`No bytes left in buffer`

Thrown as `BinaryutilsErrors.EndOfBuffer`, which extends `Error`.

A read went past the end of the data. The bytes are shorter than the format being read says
they should be, so they are truncated or not that format.

## `BINARYUTILS_VARINT_OVERFLOWS32_BITS`

`VarInt overflows 32 bits!`

Thrown as `BinaryutilsErrors.VarintOverflows32Bits`, which extends `Error`.

A variable-length integer's fifth byte sets bits past the 32nd, so the encoded value cannot
fit and the data is malformed.

## `BINARYUTILS_VARINT_UNTERMINATED`

`VarInt did not terminate after 5 bytes!`

Thrown as `BinaryutilsErrors.VarintUnterminated`, which extends `Error`.

A 32-bit variable-length integer had its continuation bit set in all five bytes it may take,
so the data is malformed.

## `BINARYUTILS_VARLONG_OVERFLOWS64_BITS`

`VarLong overflows 64 bits!`

Thrown as `BinaryutilsErrors.VarlongOverflows64Bits`, which extends `Error`.

A variable-length long sets bits past the 64th, so the encoded value cannot fit and the data
is malformed.

## `BINARYUTILS_VARLONG_UNTERMINATED`

`VarLong did not terminate after 10 bytes!`

Thrown as `BinaryutilsErrors.VarlongUnterminated`, which extends `Error`.

A 64-bit variable-length integer had its continuation bit set in all ten bytes it may take,
so the data is malformed.

## `BINARYUTILS_WRITE_ONLY_STREAM`

`Buffer is write only!`

Thrown as `BinaryutilsErrors.WriteOnlyStream`, which extends `Error`.

The stream was created for writing and has no buffer to read from. Pass a buffer when
creating a stream you read.
<!-- /fact -->
