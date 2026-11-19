import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Error thrown when bytes are not a readable brarchive. */
export abstract class BrarchiveError extends JSPrismarineError {
    public override name = 'BrarchiveError';
}

/** Error thrown when a filter value does not follow the grammar. */
export abstract class FilterParseError extends JSPrismarineError {
    public override name = 'FilterParseError';
}

/**
 * Error thrown when a pack file is not valid JSON even after comments and
 * trailing commas are removed.
 */
export abstract class JsonParseError extends JSPrismarineError {
    public override name = 'JsonParseError';
}

/** Error thrown when bytes are not a readable zip archive. */
export abstract class ZipError extends JSPrismarineError {
    public override name = 'ZipError';
}

/** The errors `@jsprismarine/packs` throws. */
export const PacksErrors = defineErrors('packs', {
    /** A `.brarchive` file's table of contents runs past its end, so the archive is truncated. */
    BrarchiveEntryTableTruncated: {
        message: 'brarchive entry table runs past the end of the data',
        base: BrarchiveError
    },
    /** A `.brarchive` file has bytes after its last member, so it is damaged. */
    BrarchiveTrailingBytes: {
        message: 'brarchive files end at {cursor} of {byteLength} bytes',
        base: BrarchiveError
    },
    /** A `.brarchive` member runs past the end of the archive, so it is truncated. */
    BrarchiveMemberTruncated: {
        message: 'brarchive member {name} runs past the end of the data',
        base: BrarchiveError
    },
    /** A `.brarchive` file uses a layout version this server does not read. */
    UnsupportedBrarchiveVersion: {
        message: 'brarchive version {version} is not readable, only version 1 is',
        base: BrarchiveError
    },
    /**
     * The pack cache was asked to reuse more packs than the stack has. This is a bug in the pack
     * loader.
     */
    CachePrefixOutOfRange: {
        message: 'cache prefix length {prefixLength} is outside the pack stack',
        base: RangeError
    },
    /** A zip entry's compressed data is damaged. Re-create the pack's archive. */
    ZipEntryNotInflatable: { message: 'could not inflate {name}: {value}', base: ZipError },
    /** A pack's filter has a `domain` that is not text, a number or a boolean. */
    InvalidFilterDomain: {
        message: 'domain must be a string, number or boolean',
        base: FilterParseError
    },
    /**
     * A pack archive decompresses to more than the server allows for one archive, which guards
     * against zip bombs. Ship the pack as a folder, or make it smaller.
     */
    ZipArchiveTooLarge: {
        message: '{name} expands past the {remaining} bytes left of the archive budget',
        base: ZipError
    },
    /**
     * A file in a pack archive decompresses to more than the server allows for one file, which
     * guards against zip bombs.
     */
    ZipEntryTooLarge: {
        message: '{name} expands to {entryCount} bytes, past the {maxEntryBytes} allowed',
        base: ZipError
    },
    /** A pack's filter group mixes `all_of`, `any_of` or `none_of` with other keys. */
    FilterGroupMixesKeys: {
        message: 'a filter group map holds only combinator keys, got {rest}',
        base: FilterParseError
    },
    /** A pack's filter is not an object or a list of filters. */
    InvalidFilter: { message: 'a filter must be an object or array, got {value}', base: FilterParseError },
    /** A pack's filter test has no `test` name. */
    FilterTestHasNoName: { message: 'a filter test needs a string test name', base: FilterParseError },
    /** The pack cache file is not one this version wrote, so it is ignored and rebuilt. */
    InvalidPackCache: 'invalid cache shape',
    /**
     * A datapack path names a file that is not a zip archive. Point it at the pack's folder or its
     * zip.
     */
    NotDatapack: '{path} is neither a directory nor a zip archive',
    /** A pack archive's file list is damaged. Re-create the archive. */
    ZipBadCentralDirectoryEntry: {
        message: 'malformed zip: bad central directory entry signature',
        base: ZipError
    },
    /** A pack archive's entry header is damaged. Re-create the archive. */
    ZipBadLocalHeader: { message: 'malformed zip: bad local header for {name}', base: ZipError },
    /**
     * A pack archive's entry decompresses to a different size than the archive records, so it is
     * damaged.
     */
    ZipEntrySizeMismatch: {
        message: 'malformed zip: {name} inflates to more or less than its declared {size} bytes',
        base: ZipError
    },
    /**
     * Two entries in a pack archive share bytes, a trick zip bombs use, so the archive is refused.
     */
    ZipEntriesOverlap: { message: 'malformed zip: {name} overlaps another entry', base: ZipError },
    /** A pack archive's entry runs past its end, so the archive is truncated. */
    ZipEntryTruncated: {
        message: 'malformed zip: {name} runs past the end of the archive',
        base: ZipError
    },
    /**
     * An uncompressed entry in a pack archive records two different sizes, so the archive is
     * damaged.
     */
    ZipStoredEntrySizesDiffer: { message: 'malformed zip: stored {name} has two sizes', base: ZipError },
    /** The Java data validator started without its schema language. This is a bug in its setup. */
    McdocLanguageIsNotRegistered: 'the mcdoc language is not registered',
    /** A pack's filter group holds something other than a filter or a list of filters. */
    InvalidFilterGroupMembers: {
        message: '{key} must hold a filter or an array of filters, got {members}',
        base: FilterParseError
    },
    /**
     * The Bedrock schema validator found no schemas where `bedrock-samples` should be. Fetch the
     * sources with `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`.
     */
    NoBedrockSamplesSchemas: 'no bedrock-samples schemas under {base}',
    /**
     * The Java data validator found no schemas in the folder it was given. Fetch the sources first.
     */
    NoMcdocFiles: 'no .mcdoc files under {root}',
    /**
     * The Java data validator was given a target release it cannot place among Java releases, so
     * it cannot decide which `#[since]` and `#[until]` schema fields apply. It reads releases such
     * as `26.3` and `1.21.5`, and the snapshot, pre-release and release candidate ids of a release,
     * such as `26.4-snapshot-10`. Pass `release` to the validator to name the release to gate on.
     */
    UncomparableJavaRelease: 'cannot place Java {release} among releases to gate the schema on; pass `release`',
    /**
     * A file read as a `.brarchive` does not start with the format's signature, so it is another
     * format.
     */
    NotBrarchive: { message: 'not a brarchive: bad magic number', base: BrarchiveError },
    /** A file read as a pack archive is not a zip, or is truncated. */
    NotZip: { message: 'not a zip: no end-of-central-directory record', base: ZipError },
    /**
     * The pack cache keys its files by this package's version, and `package.json` has none. The
     * package is damaged.
     */
    PackageVersionMissing: 'packages/packs/package.json has no string version',
    /** A pack's legacy filter uses an operator Bedrock does not define. */
    UnknownIntegerOperator: { message: 'unknown integer operator {value}', base: FilterParseError },
    /** A pack's legacy filter names a subject Bedrock does not define. */
    UnknownIntegerSubject: { message: 'unknown integer subject {value}', base: FilterParseError },
    /** A pack's filter uses an operator Bedrock does not define. */
    UnknownOperator: { message: 'unknown operator {value}', base: FilterParseError },
    /** A pack's filter names a subject Bedrock does not define, such as `self` misspelled. */
    UnknownSubject: { message: 'unknown subject {value}', base: FilterParseError },
    /**
     * A pack archive uses a compression method other than stored or deflate. Re-create the archive
     * with ordinary zip settings.
     */
    UnsupportedZipCompressionMethod: {
        message: 'unsupported zip compression method {method} for {name}',
        base: ZipError
    },
    /** A pack's filter has a `value` that is not text, a number or a boolean. */
    InvalidFilterValue: { message: 'value must be a string, number or boolean', base: FilterParseError },
    /** A pack file is not valid JSON even after comments and trailing commas are removed. The message is the JSON parser's own. */
    NotValidJson: { message: '{reason}', base: JsonParseError },
    /**
     * A strict pack load found errors. The error's `diagnostics` list every one, warnings included,
     * and the message shows the first.
     */
    PackStackDidNotLoadCleanly: 'the pack stack did not load cleanly: {count} error(s), first: {first}'
});
