---
title: '@jsprismarine/native-library errors'
description: The code, message and meaning of every error @jsprismarine/native-library throws.
group: Documents
category: Errors
---

# @jsprismarine/native-library errors

These are the errors `@jsprismarine/native-library` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.native-library -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                | What its errors mean                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NativeLibraryError` | Why a package's native library cannot be loaded, with the platform and what to do about it in the message. Every package that loads a native library throws its loading errors with this base. |

## `NATIVE_LIBRARY_DIGEST_DOES_NOT_MATCH_PUBLISHED_BUILD`

`{path} has SHA-256 {digest}, not the {published} {packageName} publishes for {platform}`

Thrown as `NativeLibraryErrors.DigestDoesNotMatchPublishedBuild`, which extends `NativeLibraryError`.

The native library file is not the build the package publishes, so it was altered or comes
from another version. Reinstall the package.

## `NATIVE_LIBRARY_DOWNLOAD_DIGEST_MISMATCH`

`{file} has SHA-256 {digest} and {byteLength} bytes; the manifest expects {sha256} and {bytes}`

Thrown as `NativeLibraryErrors.DownloadDigestMismatch`, which extends `Error`.

The downloaded native library does not match the digest the package publishes, so it was
corrupted in transit or replaced. Retry the install.

## `NATIVE_LIBRARY_DOWNLOAD_FAILED`

`{url} answered {status}`

Thrown as `NativeLibraryErrors.DownloadFailed`, which extends `Error`.

Downloading a package's native library failed with that HTTP status. Retry, or point the
package's `_LIBRARY` environment variable at a library you built.

## `NATIVE_LIBRARY_INVALID_NATIVE_MANIFEST`

`` The native manifest needs `build` and `baseUrl` strings ``

Thrown as `NativeLibraryErrors.InvalidNativeManifest`, which extends `NativeLibraryError`.

The package's native manifest is malformed, so the package was published broken. Reinstall
it, or report it.

## `NATIVE_LIBRARY_INVALID_NATIVE_MANIFEST_ENTRY`

`The native manifest's entry for {key} is malformed`

Thrown as `NativeLibraryErrors.InvalidNativeManifestEntry`, which extends `NativeLibraryError`.

The package's native manifest has a malformed platform entry, so the package was published
broken. Reinstall it, or report it.

## `NATIVE_LIBRARY_LIBRARY_NOT_INSTALLED`

`{packageName} has no build for {platform} at {installed}. {advice}`

Thrown as `NativeLibraryErrors.LibraryNotInstalled`, which extends `NativeLibraryError`.

The package's native library for this platform is not installed: its install script has not
run, or in a checkout, `build:native` has not. The message says how to get it.

## `NATIVE_LIBRARY_LIBRARY_OVERRIDE_MISSING`

`{libraryEnv} names {override}, which does not exist`

Thrown as `NativeLibraryErrors.LibraryOverrideMissing`, which extends `NativeLibraryError`.

The environment variable that overrides a package's native library names a file that does
not exist. Point it at a build of the library, or unset it to use the installed one.

## `NATIVE_LIBRARY_NO_BUILD_FOR_PLATFORM`

`{packageName} publishes no build for {platform}.`

Thrown as `NativeLibraryErrors.NoBuildForPlatform`, which extends `NativeLibraryError`.

The package publishes no prebuilt native library for this platform. Build it from a checkout
with the package's `build:native` script and point its `_LIBRARY` environment variable at it.

## `NATIVE_LIBRARY_NO_PUBLISHED_BUILD_TO_CHECK`

`{path} has SHA-256 {digest}, and {packageName} publishes no build for {platform} to check it against`

Thrown as `NativeLibraryErrors.NoPublishedBuildToCheck`, which extends `NativeLibraryError`.

The native library file has no published digest to check against for this platform, and it
was not built locally either, so it is refused.
<!-- /fact -->
