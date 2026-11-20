import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Error thrown when an addon's folder does not hold a valid addon. */
export abstract class InvalidAddonError extends JSPrismarineError {
    public override name = 'InvalidAddonError';
}

/** Error thrown when an addon index does not follow its schema. */
export abstract class InvalidAddonIndexError extends JSPrismarineError {
    public override name = 'InvalidAddonIndexError';
}

/** The errors `@jsprismarine/addon-tools` throws. */
export const AddonToolsErrors = defineErrors('addon-tools', {
    /**
     * An addon's folder name is also its name in the index and in `addon install`, so it may hold
     * only lowercase letters, digits and single hyphens between them, such as `tps-bar`. Rename the
     * folder.
     */
    InvalidAddonName: {
        message: '{name} is not an addon name: use lowercase letters, digits and single hyphens',
        base: InvalidAddonError
    },
    /** An addon's folder lacks a file every addon needs. Add the file the message names. */
    MissingAddonFile: { message: 'addon {addon} has no {file}', base: InvalidAddonError },
    /**
     * An addon's `addon.json` is not the object the build expects: a `description`, a `minServer`
     * version such as `0.23.0`, and a `license`, each a non-empty string, and no other keys. The
     * addon's version lives in its `manifest.json` header, not here.
     */
    InvalidAddonJson: { message: "addon {addon}'s addon.json is invalid: {problem}", base: InvalidAddonError },
    /** An addon's `manifest.json` is not a valid behavior pack manifest. Fix what the message names. */
    InvalidAddonManifest: { message: "addon {addon}'s manifest.json is invalid: {problem}", base: InvalidAddonError },
    /**
     * An addon is a behavior pack, so its manifest may declare only `data` and `script` modules.
     * Move resource pack content into a pack of its own.
     */
    NotABehaviorPack: {
        message: 'addon {addon} has a {type} module; an addon is a behavior pack with data and script modules only',
        base: InvalidAddonError
    },
    /**
     * The header's version is the addon's version, and every module of the manifest has to carry
     * the same one, so a release never mixes versions. Set the module's version to the header's.
     */
    ModuleVersionDiffers: {
        message: "addon {addon}'s {type} module is version {moduleVersion}, but its header is {version}",
        base: InvalidAddonError
    },
    /** An addon's script module names an `entry` file the folder does not have. */
    MissingScriptEntry: { message: "addon {addon}'s script entry {entry} does not exist", base: InvalidAddonError },
    /**
     * An addon's folder holds a symbolic link or another entry that is neither a file nor a folder.
     * A pack holds files only, so replace the link with the file it points at.
     */
    UnsupportedAddonEntry: {
        message: 'addon {addon} has {path}, which is neither a file nor a folder',
        base: InvalidAddonError
    },
    /**
     * An addon's version is already in the published index with other contents. An installed
     * addon is locked to its version's hash, so a published version never changes. Raise the
     * version in the addon's `manifest.json` header.
     */
    PublishedVersionChanged: {
        message: '{name} {version} is already published with other contents; raise the version in its manifest header',
        base: InvalidAddonError
    },
    /** An addon index is not the object its schema describes. Fix what the message names. */
    InvalidAddonIndex: { message: 'the addon index is invalid: {problem}', base: InvalidAddonIndexError },
    /**
     * An addon index declares a `schemaVersion` this version of the tools does not read. Update
     * the tools, or the server that reads the index.
     */
    UnsupportedAddonIndexVersion: {
        message: 'the addon index has schema version {schemaVersion}, and only version {supported} is readable',
        base: InvalidAddonIndexError
    },
    /**
     * The published addon index could not be downloaded: the release answered with an error other
     * than 404, or did not answer. Check the URL and try again; a 404 means there is no release
     * yet and is not an error.
     */
    PublishedIndexUnavailable: { message: 'could not download the published index {url}: {status}' },
    /** The URL a release's files download from must be an `https:` URL. */
    InvalidBaseUrl: { message: 'the base URL {url} is not an https URL', base: TypeError },
    /** The `jsp-addon` command line was given arguments it does not take. Run `jsp-addon --help`. */
    InvalidArguments: { message: '{problem}; run jsp-addon --help for usage', base: TypeError }
});
