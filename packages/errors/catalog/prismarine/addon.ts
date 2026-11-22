import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from '../defineErrors';

/** Error thrown when an addon's download or folder is not what its lock or source says it is. */
export abstract class AddonIntegrityError extends JSPrismarineError {
    public override name = 'AddonIntegrityError';
}

/** The errors the addon installer of `@jsprismarine/prismarine` throws. */
export const PrismarineAddonErrors = defineErrors('prismarine/addon', {
    /**
     * `addon install` takes a bare addon name such as `tps-bar`, `<owner>/<repo>/<name>`, either
     * with an optional `@<range>`, an `https:` URL of an `.mcpack`, or a path that starts with
     * `./`, `../` or `/` or ends in `.mcpack`. A range is `^1.2.3`, `~1.2.3`, `1.2.3` or `*`. Fix
     * what the message names.
     */
    InvalidAddonSpec: { message: '{spec} is not an addon to install: {problem}', base: TypeError },
    /**
     * An installed addon's local name is its key in `addons.json` and its folder under `addons/`,
     * so it may hold only lowercase letters, digits and single hyphens between them. Pick another
     * with `addon install <addon> as <name>`.
     */
    InvalidAddonKey: {
        message: '{key} is not a local addon name: use lowercase letters, digits and single hyphens',
        base: TypeError
    },
    /**
     * An addon is already installed under this local name. Run `addon update <name>` to move it to
     * a newer version, or install the other addon under another name with `as <name>`.
     */
    AddonAlreadyInstalled: {
        message: '{key} is already installed; run addon update {key}, or install this one with as <another name>'
    },
    /** No addon is installed under this local name. `addon list` shows what is. */
    AddonNotInstalled: { message: 'no addon is installed as {key}; addon list shows what is' },
    /**
     * The source's release has no index to install from: the repository has no `addons` release,
     * or the release has no `index.json` yet. Check the repository's name.
     */
    NoAddonIndex: { message: '{source} publishes no addon index at {url}' },
    /** The source's index has no version of the addon that falls in the range. */
    AddonVersionNotFound: { message: '{source} has no version of {name} in {range}' },
    /**
     * Every version of the addon in the range needs a newer JSPrismarine than this server. Update
     * the server, or ask for an older version of the addon with `@<version>`.
     */
    AddonNeedsNewerServer: {
        message: '{name} {version} needs JSPrismarine {minServer} or newer, and this server is {server}'
    },
    /**
     * An addon's pack could not be downloaded: the server answered with an error, did not answer
     * or finish in time, or redirected to a URL that is not `https:`. Check the URL, or try again
     * later.
     */
    AddonDownloadFailed: { message: 'could not download {url}: {status}' },
    /**
     * An addon's pack is larger than the installer reads into memory, so it stopped the download.
     * An addon is a behavior pack of scripts and data, which stays far below the limit; a pack this
     * large is not one.
     */
    AddonTooLarge: {
        message: '{url} is larger than the {limit} bytes an addon pack may be',
        base: AddonIntegrityError
    },
    /**
     * The pack's manifest has another version than the index or `addons.lock.json` lists for it,
     * even though its SHA-256 matches. The source published the wrong pack under that version.
     * Ask its author to publish it again.
     */
    AddonVersionDiffers: {
        message: '{key} is version {actual} inside, but {recordedBy} lists it as {expected}',
        base: AddonIntegrityError
    },
    /**
     * A downloaded pack's SHA-256 is not the one the index or `addons.lock.json` records, so it is
     * not the pack that was published or installed, and the installer refuses it. When the lock is
     * the one that disagrees, the file at that URL changed after it was installed: run `addon
     * update <name>` to install what the source publishes now.
     */
    AddonHashMismatch: {
        message: '{url} has SHA-256 {actual}, not the {expected} {recordedBy} records',
        base: AddonIntegrityError
    },
    /**
     * What was installed is not an addon: it has no `manifest.json` at its root or in a single
     * folder, the manifest is not a behavior pack's, or a file in the archive would land outside
     * the addon's folder.
     */
    InvalidAddonPack: { message: '{key} is not a behavior pack: {problem}', base: AddonIntegrityError },
    /**
     * `addons.json` or `addons.lock.json` beside `config.json` is not what the installer writes.
     * Fix what the message names in the file it names. Only when `addons.lock.json` is the broken
     * one may you delete it instead: `addon sync` then resolves every addon again, which can pick
     * newer versions within each range than the ones locked.
     */
    InvalidAddonsFile: { message: '{file} is invalid: {problem}', base: TypeError },
    /**
     * An addon installed from a local folder is linked to that folder, and the folder is gone.
     * Put it back, or run `addon remove <name>`.
     */
    AddonPathMissing: { message: '{key} is installed from {path}, which does not exist' },
    /**
     * An addon was installed from an `.mcpack` on disk, whose hash the lock records, and that path
     * now names a folder. Run `addon remove <name>`, then install the folder.
     */
    AddonPathNotPack: {
        message: '{key} was installed from the .mcpack {path}, which is now a folder',
        base: AddonIntegrityError
    },
    /**
     * A folder installs as a link from `addons/<name>/` to it, which replaces what `addons/<name>/`
     * holds, so the folder cannot be that one or inside it. Move it out of `addons/` and install it
     * from there.
     */
    AddonSourceInsideTarget: {
        message: 'cannot install {key} from {path}: it is inside addons/{key}, which the install replaces'
    }
});
