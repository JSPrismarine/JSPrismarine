/**
 * Chooses the lint scripts the agent lint gate runs for a set of uncommitted changes.
 *
 * `pnpm run lint` runs Prettier and Biome on the changed files, then every check `lint:custom`
 * lists, and most of those scan the whole repository whatever changed. The gate runs Prettier and
 * Biome as before, but runs a custom check only when a changed path is one of that check's inputs.
 * The root `package.json` stays the source of truth for the list: a check {@link CHECK_INPUTS} has
 * no entry for runs on every change, and a change to the manifest or the lockfile runs them all. CI's lint job runs every check, so this only trims what the gate repeats locally.
 */

/** Scripts the gate always runs; each lints only the changed files. */
export const FORMATTER_SCRIPTS: readonly string[] = ['lint:prettier', 'lint:biome'];

/** Paths whose change runs every custom check: they can change a check's script or tool version. */
const RUN_ALL: readonly string[] = ['package.json', 'pnpm-lock.yaml'];

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const MANIFEST = /(?:^|\/)package\.json$/;
const MARKDOWN = /\.mdx?$/;

/** Whether a path is one of `prefixes` or lies under one ending in `/`. */
const under =
    (...prefixes: readonly string[]) =>
    (file: string): boolean =>
        prefixes.some((prefix) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));

/** What a changed path tells a check: the path, and whether it is new to the tree. */
export interface ChangedPath {
    path: string;
    added: boolean;
}

/**
 * The inputs of each `lint:custom` script, as a test on one changed path. Each test covers the
 * check's own script and baseline as well as the files it reads.
 */
export const CHECK_INPUTS: Readonly<Record<string, (change: ChangedPath) => boolean>> = {
    // File names only change when a path is added or renamed.
    'lint:american-filenames': ({ path, added }) => added || path === 'scripts/check-american-filenames.mts',
    'lint:addon-turbo': ({ path }) =>
        /^addons\/[^/]+\/(?:package|turbo|tsconfig)\.json$/.test(path) || path === 'scripts/check-addon-turbo.mts',
    'lint:barrels': ({ path }) =>
        CODE.test(path) || under('biome.json', 'scripts/barrel-baseline.json', 'scripts/check-barrels.mts')(path),
    'lint:landmines': ({ path }) =>
        CODE.test(path) ||
        MANIFEST.test(path) ||
        under('.oxlintrc.json', 'scripts/landmines-baseline.json', 'scripts/check-landmines.mts')(path),
    'lint:packets': ({ path }) =>
        under(
            'packages/prismarine/src/network/packet/',
            'packages/raknet/src/protocol/',
            'scripts/packet-codec-baseline.json',
            'scripts/check-packet-codecs.mts'
        )(path),
    'lint:wire-layouts': ({ path }) =>
        under(
            'packages/protocol/src/bedrock/packet/',
            'scripts/wire-layout-exceptions.json',
            'scripts/check-wire-layouts.mts'
        )(path),
    'lint:error-classes': ({ path }) => under('packages/errors/', 'scripts/generate-error-classes.mts')(path),
    'lint:jsdoc': ({ path }) =>
        /^packages\/[^/]+\/src\/.*\.ts$/.test(path) ||
        under('scripts/jsdoc-baseline.json', 'scripts/check-jsdoc.mts')(path),
    'lint:java-sources': ({ path }) =>
        CODE.test(path) ||
        under(
            'packages/parity/goldens/java-sources.json',
            'scripts/java-sources-baseline.json',
            'packages/bedrock-data/utils/java-sources/'
        )(path),
    'lint:encoding': () => true,
    // Facts also read code all over the repository; a code change that moves a fact is left to CI,
    // and the docs build refills the value on the site either way.
    'lint:docs-facts': ({ path }) => MARKDOWN.test(path) || MANIFEST.test(path) || path.startsWith('tools/docs/'),
    'lint:brand-assets': ({ path }) => under('docs/brand/', 'tools/docs/')(path),
    'lint:coderabbit-labels': ({ path }) =>
        under('.github/labels.yml', '.coderabbit.yaml', 'scripts/coderabbit-labels.mts')(path),
    'lint:changesets': ({ path }) =>
        path.startsWith('.changeset/') || MANIFEST.test(path) || path === 'scripts/check-changesets.mts',
    'lint:vscode-launch': ({ path }) =>
        /^addons\/[^/]+\/manifest\.json$/.test(path) ||
        under('.vscode/launch.json', 'scripts/script-debug-server.mts')(path),
    // Root scripts import package source, so any code change can break their typecheck.
    'typecheck:scripts': ({ path }) => CODE.test(path) || path === 'tsconfig.scripts.json'
};

/**
 * Reads the script names a `concurrently` command line runs as `pnpm:<script>` arguments.
 *
 * @param command - The `lint:custom` script from the root `package.json`.
 */
export const customChecks = (command: string): string[] =>
    [...command.matchAll(/\bpnpm:(\S+)/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

/**
 * The scripts the gate runs for `changes`: the formatters, then each custom check one of the changes
 * reaches, in `checks` order.
 *
 * @param checks - The scripts `lint:custom` runs, from {@link customChecks}.
 * @param changes - The uncommitted changes, relative to the repository root, with forward slashes.
 */
export const gateScripts = (checks: readonly string[], changes: readonly ChangedPath[]): string[] => {
    if (changes.length === 0) return [];
    const all = changes.some(({ path }) => RUN_ALL.includes(path));
    return [
        ...FORMATTER_SCRIPTS,
        ...checks.filter((check) => {
            const inputs = CHECK_INPUTS[check];
            return all || inputs === undefined || changes.some(inputs);
        })
    ];
};
