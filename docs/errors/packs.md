---
title: '@jsprismarine/packs errors'
description: The code, message and meaning of every error @jsprismarine/packs throws.
group: Documents
category: Errors
---

# @jsprismarine/packs errors

These are the errors `@jsprismarine/packs` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.packs -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class              | What its errors mean                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `BrarchiveError`   | Error thrown when bytes are not a readable brarchive.                                                |
| `FilterParseError` | Error thrown when a filter value does not follow the grammar.                                        |
| `JsonParseError`   | Error thrown when a pack file is not valid JSON even after comments and trailing commas are removed. |
| `ZipError`         | Error thrown when bytes are not a readable zip archive.                                              |

## `PACKS_BRARCHIVE_ENTRY_TABLE_TRUNCATED`

`brarchive entry table runs past the end of the data`

Thrown as `PacksErrors.BrarchiveEntryTableTruncated`, which extends `BrarchiveError`.

A `.brarchive` file's table of contents runs past its end, so the archive is truncated.

## `PACKS_BRARCHIVE_MEMBER_TRUNCATED`

`brarchive member {name} runs past the end of the data`

Thrown as `PacksErrors.BrarchiveMemberTruncated`, which extends `BrarchiveError`.

A `.brarchive` member runs past the end of the archive, so it is truncated.

## `PACKS_BRARCHIVE_TRAILING_BYTES`

`brarchive files end at {cursor} of {byteLength} bytes`

Thrown as `PacksErrors.BrarchiveTrailingBytes`, which extends `BrarchiveError`.

A `.brarchive` file has bytes after its last member, so it is damaged.

## `PACKS_CACHE_PREFIX_OUT_OF_RANGE`

`cache prefix length {prefixLength} is outside the pack stack`

Thrown as `PacksErrors.CachePrefixOutOfRange`, which extends `RangeError`.

The pack cache was asked to reuse more packs than the stack has. This is a bug in the pack
loader.

## `PACKS_FILTER_GROUP_MIXES_KEYS`

`a filter group map holds only combinator keys, got {rest}`

Thrown as `PacksErrors.FilterGroupMixesKeys`, which extends `FilterParseError`.

A pack's filter group mixes `all_of`, `any_of` or `none_of` with other keys.

## `PACKS_FILTER_TEST_HAS_NO_NAME`

`a filter test needs a string test name`

Thrown as `PacksErrors.FilterTestHasNoName`, which extends `FilterParseError`.

A pack's filter test has no `test` name.

## `PACKS_INVALID_FILTER`

`a filter must be an object or array, got {value}`

Thrown as `PacksErrors.InvalidFilter`, which extends `FilterParseError`.

A pack's filter is not an object or a list of filters.

## `PACKS_INVALID_FILTER_DOMAIN`

`domain must be a string, number or boolean`

Thrown as `PacksErrors.InvalidFilterDomain`, which extends `FilterParseError`.

A pack's filter has a `domain` that is not text, a number or a boolean.

## `PACKS_INVALID_FILTER_GROUP_MEMBERS`

`{key} must hold a filter or an array of filters, got {members}`

Thrown as `PacksErrors.InvalidFilterGroupMembers`, which extends `FilterParseError`.

A pack's filter group holds something other than a filter or a list of filters.

## `PACKS_INVALID_FILTER_VALUE`

`value must be a string, number or boolean`

Thrown as `PacksErrors.InvalidFilterValue`, which extends `FilterParseError`.

A pack's filter has a `value` that is not text, a number or a boolean.

## `PACKS_INVALID_PACK_CACHE`

`invalid cache shape`

Thrown as `PacksErrors.InvalidPackCache`, which extends `Error`.

The pack cache file is not one this version wrote, so it is ignored and rebuilt.

## `PACKS_MCDOC_LANGUAGE_IS_NOT_REGISTERED`

`the mcdoc language is not registered`

Thrown as `PacksErrors.McdocLanguageIsNotRegistered`, which extends `Error`.

The Java data validator started without its schema language. This is a bug in its setup.

## `PACKS_NO_BEDROCK_SAMPLES_SCHEMAS`

`no bedrock-samples schemas under {base}`

Thrown as `PacksErrors.NoBedrockSamplesSchemas`, which extends `Error`.

The Bedrock schema validator found no schemas where `bedrock-samples` should be. Fetch the
sources with `pnpm --filter

## `PACKS_NO_MCDOC_FILES`

`no .mcdoc files under {root}`

Thrown as `PacksErrors.NoMcdocFiles`, which extends `Error`.

The Java data validator found no schemas in the folder it was given. Fetch the sources first.

## `PACKS_NOT_BRARCHIVE`

`not a brarchive: bad magic number`

Thrown as `PacksErrors.NotBrarchive`, which extends `BrarchiveError`.

A file read as a `.brarchive` does not start with the format's signature, so it is another
format.

## `PACKS_NOT_DATAPACK`

`{path} is neither a directory nor a zip archive`

Thrown as `PacksErrors.NotDatapack`, which extends `Error`.

A datapack path names a file that is not a zip archive. Point it at the pack's folder or its
zip.

## `PACKS_NOT_VALID_JSON`

`{reason}`

Thrown as `PacksErrors.NotValidJson`, which extends `JsonParseError`.

A pack file is not valid JSON even after comments and trailing commas are removed. The message is the JSON parser's own.

## `PACKS_NOT_ZIP`

`not a zip: no end-of-central-directory record`

Thrown as `PacksErrors.NotZip`, which extends `ZipError`.

A file read as a pack archive is not a zip, or is truncated.

## `PACKS_PACK_STACK_DID_NOT_LOAD_CLEANLY`

`the pack stack did not load cleanly: {count} error(s), first: {first}`

Thrown as `PacksErrors.PackStackDidNotLoadCleanly`, which extends `Error`.

A strict pack load found errors. The error's `diagnostics` list every one, warnings included,
and the message shows the first.

## `PACKS_PACKAGE_VERSION_MISSING`

`packages/packs/package.json has no string version`

Thrown as `PacksErrors.PackageVersionMissing`, which extends `Error`.

The pack cache keys its files by this package's version, and `package.json` has none. The
package is damaged.

## `PACKS_UNKNOWN_INTEGER_OPERATOR`

`unknown integer operator {value}`

Thrown as `PacksErrors.UnknownIntegerOperator`, which extends `FilterParseError`.

A pack's legacy filter uses an operator Bedrock does not define.

## `PACKS_UNKNOWN_INTEGER_SUBJECT`

`unknown integer subject {value}`

Thrown as `PacksErrors.UnknownIntegerSubject`, which extends `FilterParseError`.

A pack's legacy filter names a subject Bedrock does not define.

## `PACKS_UNKNOWN_OPERATOR`

`unknown operator {value}`

Thrown as `PacksErrors.UnknownOperator`, which extends `FilterParseError`.

A pack's filter uses an operator Bedrock does not define.

## `PACKS_UNKNOWN_SUBJECT`

`unknown subject {value}`

Thrown as `PacksErrors.UnknownSubject`, which extends `FilterParseError`.

A pack's filter names a subject Bedrock does not define, such as `self` misspelled.

## `PACKS_UNSUPPORTED_BRARCHIVE_VERSION`

`brarchive version {version} is not readable, only version 1 is`

Thrown as `PacksErrors.UnsupportedBrarchiveVersion`, which extends `BrarchiveError`.

A `.brarchive` file uses a layout version this server does not read.

## `PACKS_UNSUPPORTED_ZIP_COMPRESSION_METHOD`

`unsupported zip compression method {method} for {name}`

Thrown as `PacksErrors.UnsupportedZipCompressionMethod`, which extends `ZipError`.

A pack archive uses a compression method other than stored or deflate. Re-create the archive
with ordinary zip settings.

## `PACKS_ZIP_ARCHIVE_TOO_LARGE`

`{name} expands past the {remaining} bytes left of the archive budget`

Thrown as `PacksErrors.ZipArchiveTooLarge`, which extends `ZipError`.

A pack archive decompresses to more than the server allows for one archive, which guards
against zip bombs. Ship the pack as a folder, or make it smaller.

## `PACKS_ZIP_BAD_CENTRAL_DIRECTORY_ENTRY`

`malformed zip: bad central directory entry signature`

Thrown as `PacksErrors.ZipBadCentralDirectoryEntry`, which extends `ZipError`.

A pack archive's file list is damaged. Re-create the archive.

## `PACKS_ZIP_BAD_LOCAL_HEADER`

`malformed zip: bad local header for {name}`

Thrown as `PacksErrors.ZipBadLocalHeader`, which extends `ZipError`.

A pack archive's entry header is damaged. Re-create the archive.

## `PACKS_ZIP_ENTRIES_OVERLAP`

`malformed zip: {name} overlaps another entry`

Thrown as `PacksErrors.ZipEntriesOverlap`, which extends `ZipError`.

Two entries in a pack archive share bytes, a trick zip bombs use, so the archive is refused.

## `PACKS_ZIP_ENTRY_NOT_INFLATABLE`

`could not inflate {name}: {value}`

Thrown as `PacksErrors.ZipEntryNotInflatable`, which extends `ZipError`.

A zip entry's compressed data is damaged. Re-create the pack's archive.

## `PACKS_ZIP_ENTRY_SIZE_MISMATCH`

`malformed zip: {name} inflates to more or less than its declared {size} bytes`

Thrown as `PacksErrors.ZipEntrySizeMismatch`, which extends `ZipError`.

A pack archive's entry decompresses to a different size than the archive records, so it is
damaged.

## `PACKS_ZIP_ENTRY_TOO_LARGE`

`{name} expands to {entryCount} bytes, past the {maxEntryBytes} allowed`

Thrown as `PacksErrors.ZipEntryTooLarge`, which extends `ZipError`.

A file in a pack archive decompresses to more than the server allows for one file, which
guards against zip bombs.

## `PACKS_ZIP_ENTRY_TRUNCATED`

`malformed zip: {name} runs past the end of the archive`

Thrown as `PacksErrors.ZipEntryTruncated`, which extends `ZipError`.

A pack archive's entry runs past its end, so the archive is truncated.

## `PACKS_ZIP_STORED_ENTRY_SIZES_DIFFER`

`malformed zip: stored {name} has two sizes`

Thrown as `PacksErrors.ZipStoredEntrySizesDiffer`, which extends `ZipError`.

An uncompressed entry in a pack archive records two different sizes, so the archive is
damaged.
<!-- /fact -->
