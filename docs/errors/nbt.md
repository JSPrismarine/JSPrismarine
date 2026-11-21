---
title: '@jsprismarine/nbt errors'
description: The code, message and meaning of every error @jsprismarine/nbt throws.
group: Documents
category: Errors
---

# @jsprismarine/nbt errors

These are the errors `@jsprismarine/nbt` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.nbt -->
## `NBT_ALLOCATION_LIMIT_REACHED`

`Could not allocate more bytes due to reaching the set limit`

Thrown as `NbtErrors.AllocationLimitReached`, which extends `Error`.

The NBT data declares more bytes than the reader's allocation limit allows, which guards
against data built to exhaust memory. The data is malformed or hostile.

## `NBT_COMPOUND_NAME_MISMATCH`

`Failed to add NBTTagCompound with name {name} given name {name2}`

Thrown as `NbtErrors.CompoundNameMismatch`, which extends `Error`.

A compound tag was added under a name that differs from its own.

## `NBT_EXPECTED_BYTE`

`Invalid NBT Data: Expected byte`

Thrown as `NbtErrors.ExpectedByte`, which extends `Error`.

The NBT data ended where a byte should be, so it is truncated.

## `NBT_EXPECTED_BYTE_ARRAY`

`Invalid NBT Data: Expected byte array data`

Thrown as `NbtErrors.ExpectedByteArray`, which extends `Error`.

The NBT data ended inside a byte array, so it is truncated.

## `NBT_EXPECTED_BYTE_LIST`

`Invalid NBT Data: Expected bytes for list`

Thrown as `NbtErrors.ExpectedByteList`, which extends `Error`.

The NBT data ended inside a list of bytes, so it is truncated.

## `NBT_EXPECTED_COMPOUND_TAG_ID`

`Invalid NBT Data: Expected Tag ID in compound tag`

Thrown as `NbtErrors.ExpectedCompoundTagId`, which extends `Error`.

The NBT data ended inside a compound tag before its end tag, so it is truncated.

## `NBT_EXPECTED_DOUBLE`

`Invalid NBT Data: Expected double`

Thrown as `NbtErrors.ExpectedDouble`, which extends `Error`.

The NBT data ended where a double should be, so it is truncated.

## `NBT_EXPECTED_DOUBLE_LIST`

`Invalid NBT Data: Expected doubles for list`

Thrown as `NbtErrors.ExpectedDoubleList`, which extends `Error`.

The NBT data ended inside a list of doubles, so it is truncated.

## `NBT_EXPECTED_FLOAT_LIST`

`Invalid NBT Data: Expected floats for list`

Thrown as `NbtErrors.ExpectedFloatList`, which extends `Error`.

The NBT data ended inside a list of floats, so it is truncated.

## `NBT_EXPECTED_INT`

`Invalid NBT Data: Expected int`

Thrown as `NbtErrors.ExpectedInt`, which extends `Error`.

The NBT data ended where an int should be, so it is truncated.

## `NBT_EXPECTED_INT_ARRAY`

`Invalid NBT Data: Expected int array data`

Thrown as `NbtErrors.ExpectedIntArray`, which extends `Error`.

The NBT data ended inside an int array, so it is truncated.

## `NBT_EXPECTED_INT_LIST`

`Invalid NBT Data: Expected ints for list`

Thrown as `NbtErrors.ExpectedIntList`, which extends `Error`.

The NBT data ended inside a list of ints, so it is truncated.

## `NBT_EXPECTED_LIST_HEADER`

`Invalid NBT Data: Expected TAGList header`

Thrown as `NbtErrors.ExpectedListHeader`, which extends `Error`.

The NBT data ended where a list's type and length should be, so it is truncated.

## `NBT_EXPECTED_LONG`

`Invalid NBT Data: Expected long`

Thrown as `NbtErrors.ExpectedLong`, which extends `Error`.

The NBT data ended where a long should be, so it is truncated.

## `NBT_EXPECTED_LONG_LIST`

`Invalid NBT Data: Expected longs for list`

Thrown as `NbtErrors.ExpectedLongList`, which extends `Error`.

The NBT data ended inside a list of longs, so it is truncated.

## `NBT_EXPECTED_NESTED_TAG_ID`

`Invalid NBT Data: Expected tag ID in tag compound`

Thrown as `NbtErrors.ExpectedNestedTagId`, which extends `Error`.

The NBT data ended inside a nested compound tag, so it is truncated.

## `NBT_EXPECTED_SHORT`

`Invalid NBT Data: Expected short`

Thrown as `NbtErrors.ExpectedShort`, which extends `Error`.

The NBT data ended where a short should be, so it is truncated.

## `NBT_EXPECTED_SHORT_LIST`

`Invalid NBT Data: Expected shorts for list`

Thrown as `NbtErrors.ExpectedShortList`, which extends `Error`.

The NBT data ended inside a list of shorts, so it is truncated.

## `NBT_EXPECTED_STRING`

`Invalid NBT Data: Expected string bytes`

Thrown as `NbtErrors.ExpectedString`, which extends `Error`.

The NBT data ended inside a string, so it is truncated.

## `NBT_EXPECTED_STRING_LENGTH`

`Invalid NBT Data: Expected string length`

Thrown as `NbtErrors.ExpectedStringLength`, which extends `Error`.

The NBT data ended where a string's length should be, so it is truncated.

## `NBT_EXPECTED_TAG_HEADER`

`Invalid NBT Data: Not enough data to read new tag`

Thrown as `NbtErrors.ExpectedTagHeader`, which extends `Error`.

The NBT data ended where the next tag's header should be, so it is truncated.

## `NBT_NBT_PATH_EXPECTED_LIST`

`Expected list, got: {got}`

Thrown as `NbtErrors.NbtPathExpectedList`, which extends `Error`.

`/data modify … append`, `prepend` or `insert` named a tag that is not a list or an array.

## `NBT_NBT_PATH_EXPECTED_OBJECT`

`Expected object, got: {got}`

Thrown as `NbtErrors.NbtPathExpectedObject`, which extends `Error`.

`/data modify … merge` named a tag that is not a compound.

## `NBT_NBT_PATH_INVALID_INDEX`

`Invalid list index: {index}`

Thrown as `NbtErrors.NbtPathInvalidIndex`, which extends `Error`.

`/data modify … insert` named an index outside the list, or a typed array was given a
value it cannot hold, such as a string in an int array.

## `NBT_NBT_PATH_MULTIPLE`

`Only one element allowed, but path {path} matched {count}`

Thrown as `NbtErrors.NbtPathMultiple`, which extends `Error`.

A command that reads one value got a path that matched several, such as `Items[]`.
Narrow the path to one element with an index or a pattern.

## `NBT_NBT_PATH_NOT_NUMERIC`

`Can't get {path}; only numeric tags are allowed`

Thrown as `NbtErrors.NbtPathNotNumeric`, which extends `Error`.

A command asked for a number at a path that holds something else, such as `/data get` with a
scale on a compound.

## `NBT_NBT_PATH_NOTHING_FOUND`

`Found no elements matching {path}`

Thrown as `NbtErrors.NbtPathNothingFound`, which extends `Error`.

An NBT path matched nothing in the data a command read. Check the path against the data.

## `NBT_NBT_PATH_SYNTAX`

`Invalid NBT path {path} at position {position}: {reason}`

Thrown as `NbtErrors.NbtPathSyntax`, which extends `Error`.

A command's NBT path is not well formed, such as an unclosed `[` or a key that ends in `.`.
Fix the path at the position the message names.

## `NBT_NBT_PATH_TOO_DEEP`

`Resulting NBT too deeply nested`

Thrown as `NbtErrors.NbtPathTooDeep`, which extends `Error`.

`/data modify … set`, `merge`, `append`, `prepend` or `insert` would nest the data deeper
than the 512 levels an SNBT read accepts, so the edited data could not be read back. Use a
shorter path or a value that nests less.

## `NBT_NEGATIVE_BYTE_ARRAY_LENGTH`

`Invalid NBT Data: Negative byte array length`

Thrown as `NbtErrors.NegativeByteArrayLength`, which extends `Error`.

The NBT data declares a byte array with a negative length, so it is malformed.

## `NBT_NEGATIVE_INT_ARRAY_LENGTH`

`Invalid NBT Data: Negative int array length`

Thrown as `NbtErrors.NegativeIntArrayLength`, which extends `Error`.

The NBT data declares an int array with a negative length, so it is malformed.

## `NBT_NEGATIVE_LIST_LENGTH`

`Invalid NBT Data: Negative list length`

Thrown as `NbtErrors.NegativeListLength`, which extends `Error`.

The NBT data declares a list with a negative length, so it is malformed.

## `NBT_NO_ROOT_TAG`

`Invalid NBT Data: No root tag found`

Thrown as `NbtErrors.NoRootTag`, which extends `Error`.

The NBT data does not start with a compound tag, so it is not NBT or is in the other byte
order.

## `NBT_NOT_LIST_TAG`

`Invalid NBT Data: Not list tag found`

Thrown as `NbtErrors.NotListTag`, which extends `Error`.

The NBT data was read as a list, but it does not start with a list tag.

## `NBT_SNBT_SYNTAX`

`Invalid SNBT at position {position}: {reason}`

Thrown as `NbtErrors.SnbtSyntax`, which extends `Error`.

A command's SNBT text is not well formed, such as an unclosed brace or a number too large
for its suffix. Fix the text at the position the message names.

## `NBT_UNKNOWN_LIST_TYPE`

`Invalid NBTTagType`

Thrown as `NbtErrors.UnknownListType`, which extends `Error`.

A list was written with an element type that does not exist.

## `NBT_UNKNOWN_TAG`

`Invalid NBT Data: Unknown tag <{tagID}>`

Thrown as `NbtErrors.UnknownTag`, which extends `Error`.

The NBT data has a tag type that does not exist, so it is malformed or not NBT.

## `NBT_UNKNOWN_VALUE_TYPE`

`Invalid NBT Data: Cannot deduce NBT type of class {name} ({value})`

Thrown as `NbtErrors.UnknownValueType`, which extends `TypeError`.

A value was written as NBT that has no NBT type, such as a function or a class instance.
<!-- /fact -->
