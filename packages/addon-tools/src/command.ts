import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';
import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

import { ADDON_RELEASE_TAG, packFileName } from './addonIndex';
import { buildAddons, fetchPublishedIndex, releaseDownloadUrl } from './build';

/** The `jsp-addon` usage text. */
export const USAGE = `Usage: jsp-addon build [options]

Checks every addon under the addons folder, packs each into <name>-<version>.mcpack, writes its
listing files (README, icon and screenshots) beside the pack, and writes index.json.

Options:
  --addons <dir>          The folder of addons (default: addons)
  --out <dir>             Where the packs and index.json go (default: dist/addons)
  --repository <o/r>      The GitHub repository whose "${ADDON_RELEASE_TAG}" release serves the packs
                          (default: $GITHUB_REPOSITORY)
  --base-url <url>        Where the packs download from, in place of the repository's release
  --offline               Skip downloading the published index.json to merge with
  --github-output <file>  Append the release tag, the added packs and their listing files as
                          GitHub step outputs
  --help                  Show this text
`;

/** Where the command writes, and what it reads from the environment. */
export interface CommandContext {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
}

const build = async (args: readonly string[], context: CommandContext): Promise<number> => {
    const { values } = parseArgs({
        args: [...args],
        options: {
            addons: { type: 'string', default: 'addons' },
            out: { type: 'string', default: 'dist/addons' },
            repository: { type: 'string' },
            'base-url': { type: 'string' },
            offline: { type: 'boolean', default: false },
            'github-output': { type: 'string' }
        },
        strict: true
    });

    const repository = values.repository ?? context.env.GITHUB_REPOSITORY;
    const baseUrl = values['base-url'] ?? (repository ? releaseDownloadUrl(repository) : undefined);
    if (!baseUrl) throw new AddonToolsErrors.InvalidArguments({ problem: 'pass --repository or --base-url' });

    const published = values.offline ? undefined : await fetchPublishedIndex(baseUrl);
    const result = await buildAddons({
        addonsDirectory: values.addons,
        outDirectory: values.out,
        baseUrl,
        published
    });

    const added = new Set(result.added);
    for (const entry of result.built) {
        context.stdout(
            `${entry.name} ${entry.version}: ${added.has(entry) ? 'new' : 'already published'}, sha256 ${entry.sha256}\n`
        );
    }
    const count = result.index.addons.length;
    context.stdout(`Wrote ${values.out} with an index of ${count} ${count === 1 ? 'pack' : 'packs'}\n`);

    if (values['github-output']) {
        const files = result.added.map((entry) => packFileName(entry.name, entry.version));
        await appendFile(
            values['github-output'],
            `tag=${ADDON_RELEASE_TAG}\nadded=${files.join(' ')}\nlisting=${result.addedListingFiles.join(' ')}\n`
        );
    }
    return 0;
};

/**
 * Runs `jsp-addon` with its arguments.
 * @returns The exit code: 0 on success, 1 when the build fails, 2 on bad arguments.
 */
export const runCommand = async (args: readonly string[], context: CommandContext): Promise<number> => {
    const [command, ...rest] = args;
    if (command === undefined || command === '--help' || rest.includes('--help')) {
        context.stdout(USAGE);
        return 0;
    }
    try {
        if (command !== 'build') throw new AddonToolsErrors.InvalidArguments({ problem: `unknown command ${command}` });
        return await build(rest, context);
    } catch (error) {
        if (error instanceof AddonToolsErrors.InvalidArguments) {
            context.stderr(`${error.message}\n`);
            return 2;
        }
        if (error instanceof JSPrismarineError) {
            context.stderr(`${error.message}\n${error.code}: ${error.docs}\n`);
            return 1;
        }
        // parseArgs reports an unknown or malformed option with a TypeError of its own.
        if (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')) {
            context.stderr(`${error.message}; run jsp-addon --help for usage\n`);
            return 2;
        }
        throw error;
    }
};
