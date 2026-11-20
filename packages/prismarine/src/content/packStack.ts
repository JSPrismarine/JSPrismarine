/**
 * Where the default pack stack comes from.
 *
 * The order is the one [the plan](../../../../docs/plans/data-driven-vanilla.md)
 * section 7 fixes: the composed vanilla Bedrock pack defines the content,
 * this project's block and entity overlays add definitions, the Java vanilla
 * datapack configures those definitions, and world and plugin packs come last
 * so they override the vanilla members.
 *
 * Mojang's two halves are fetched rather than published with this server, so
 * a member whose directory is not on disk is left out and reported. The
 * server still starts; its content is whatever the stack did hold.
 *
 * The Bedrock half arrives as a BDS `behavior_packs` folder holding several
 * packs, and the default composes one of them: the vanilla behavior pack.
 * See {@link PackStackRequest.bedrockPacks} for why, and for how to ask for
 * the rest.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

import type { Diagnostic } from '@jsprismarine/content';
import type { BedrockPackSource, PackSource, PackStack, PrefixCacheOptions } from '@jsprismarine/packs';
import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs';
import { DEFAULT_JAVA_DATA_TARGET } from '@jsprismarine/packs/javaDataTarget';
import type { JavaDataTarget } from '@jsprismarine/packs/javaDataTarget';
import {
    bedrockSamplesCacheFolder,
    defaultBdsCacheFolder,
    javaServerCacheFolder,
    pinnedJavaReleases,
    readGeneratedJavaVersion
} from '@jsprismarine/bedrock-data/sources';
import { PrismarineContentErrors } from '@jsprismarine/errors/prismarine/content';

/** Points the resolver at a local copy of one fetched source. */
export const PACK_STACK_ENV = {
    /** A composed vanilla Bedrock behavior pack directory, or a folder of BDS vanilla layers. */
    vanillaBedrockPack: 'JSP_VANILLA_BEHAVIOR_PACK',
    /** A Java vanilla datapack directory, as the Java data generator writes one. */
    vanillaDatapack: 'JSP_VANILLA_DATAPACK',
    /** An unpacked `bedrock-samples` archive, the folder holding its one checkout folder. */
    bedrockSamples: 'JSP_BEDROCK_SAMPLES_PATH'
} as const;

/** What {@link resolvePackStack} was asked to assemble. */
export interface PackStackRequest {
    /** Whether to include the composed vanilla Bedrock pack. Defaults to true. */
    readonly vanilla?: boolean;
    /**
     * Which packs to compose out of a BDS `behavior_packs` folder, by header
     * UUID, or `'all'` for every pack the folder holds.
     *
     * Defaults to the vanilla behavior pack alone. BDS ships chemistry, the
     * editor, the server script libraries and four experimental toggles in
     * that folder, and a world composes those only when it turns them on; a
     * server aiming at vanilla parity turns none of them on. Education
     * Edition content is out of scope by
     * [plan](../../../../docs/plans/data-driven-vanilla.md) section 12
     * decision 8, and the editor's five `editor:` entities are tools for a
     * world author rather than content a server serves.
     *
     * The packs are on disk either way, so naming one here is how a server
     * that does want it opts in.
     */
    readonly bedrockPacks?: readonly string[] | 'all';
    /** Whether to include this project's block and entity vanilla overlays. Defaults to true. */
    readonly overlay?: boolean;
    /** Whether to include the Java vanilla datapack. Defaults to true. */
    readonly javaVanilla?: boolean;
    /**
     * The pinned Java release whose vanilla datapack to load, from `content-java-version`.
     * Defaults to the release `sources.json` names as `defaultVersion`. A named release must be
     * pinned and generated; {@link resolvePackStack} throws otherwise.
     */
    readonly javaVersion?: string;
    /** The world's own behavior packs and datapacks, applied after the vanilla members. */
    readonly worldPacks?: readonly PackSource[];
    /** Plugin packs, applied last so a plugin overrides a world. */
    readonly pluginPacks?: readonly PackSource[];
    /**
     * The cache to read the vanilla members from. Defaults to the nearest
     * `node_modules/.cache/jsprismarine` at or above the working directory. Tests point it at a
     * temporary directory.
     */
    readonly cacheRoot?: string;
    /**
     * The Java releases a `javaVersion` may name. Defaults to the releases `sources.json` pins.
     * Tests pass a longer list to cover a pinned release without editing the manifest.
     */
    readonly pinnedJavaReleases?: readonly string[];
}

/** The stack, plus a report of the members that could not be found. */
export interface ResolvedPackStack {
    readonly stack: PackStack;
    readonly diagnostics: readonly Diagnostic[];
    /** The immutable vanilla prefix cache used by the default content loader, when available. */
    readonly cache?: PrefixCacheOptions;
    /**
     * The Java release the vanilla datapack was generated for, read from its `version.json`.
     * Undefined when the stack holds no vanilla datapack, which loads under the default target.
     */
    readonly java?: JavaDataTarget;
}

const nodeModuleResolver = createRequire(import.meta.url);

/** Resolves a module specifier against this file, or undefined when it cannot be found. */
const resolveFrom = (specifier: string): string | undefined => {
    try {
        return nodeModuleResolver.resolve(specifier);
    } catch {
        return undefined;
    }
};

/**
 * The nearest existing path made of those segments under a `node_modules` at
 * or above the working directory.
 */
const searchUp = (...segments: readonly string[]): string | undefined => {
    let directory = process.cwd();
    for (;;) {
        const candidate = join(directory, 'node_modules', ...segments);
        if (existsSync(candidate)) return candidate;

        const parent = dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
    }
};

/**
 * Where `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` unpacks
 * its downloads: the nearest `node_modules/.cache/jsprismarine` at or above
 * the working directory, falling back to the working directory's own.
 */
const cacheRoot = (): string =>
    searchUp('.cache', 'jsprismarine') ?? join(process.cwd(), 'node_modules', '.cache', 'jsprismarine');

/** Hashes overlay paths and bytes so edits at an unchanged checkout path invalidate the cache. */
export const fingerprintPackDirectories = (directories: readonly string[]): string => {
    const files: Array<{ readonly key: string; readonly path: string }> = [];
    for (const [index, directory] of directories.entries()) {
        for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const path = join(entry.parentPath, entry.name);
            files.push({ key: `${index}/${relative(directory, path).split(sep).join('/')}`, path });
        }
    }

    files.sort((left, right) => left.key.localeCompare(right.key));
    const hash = createHash('sha256');
    for (const file of files) hash.update(file.key).update('\0').update(readFileSync(file.path)).update('\0');
    return hash.digest('hex');
};

/** The current packs package version, which is one of the cache's invalidation inputs. */
const packsVersion = (): string | undefined => {
    const path = resolveFrom('@jsprismarine/packs/package.json');
    if (path === undefined) return undefined;

    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)) return undefined;
    return typeof manifest.version === 'string' ? manifest.version : undefined;
};

/**
 * Where one fetched source is.
 *
 * An environment override wins outright, including when it points at
 * nothing: a path somebody typed is a statement of intent, and quietly
 * falling back to the cache would run the server on content it was told not
 * to use. Only an unset override searches the cache.
 */
const sourcePath = (override: string | undefined, found: () => string | undefined): string | undefined => {
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;
    return found();
};

/**
 * The version folders of one cached source, the pinned one first.
 *
 * The cache keeps every version it was asked for, so a checkout that fetched an older pin still
 * has it after the pin moves. The pinned version wins when it is there; any other is the
 * fallback for a cache that has not fetched it yet.
 */
const pinnedFirst = (root: string, pinned: string): string[] => {
    const versions = readdirSync(root);
    return versions.includes(pinned) ? [pinned, ...versions.filter((version) => version !== pinned)] : versions;
};

/**
 * The BDS `behavior_packs` directory, whose `vanilla` and `vanilla_<version>`
 * folders are the layers of the composed vanilla pack. BDS keeps chemistry,
 * the editor, the script libraries and the experimental packs in the same
 * place, so the caller gets the whole folder and names the packs it wants
 * out of it.
 */
const bdsBehaviorPacks = (root: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const version of pinnedFirst(root, defaultBdsCacheFolder)) {
        const unpacked = join(root, version, 'unpacked', 'behavior_packs');
        if (existsSync(unpacked)) return unpacked;
    }
    return undefined;
};

/** The behavior pack inside an unpacked `bedrock-samples` archive, under its one checkout folder. */
const samplesPackIn = (unpacked: string): string | undefined => {
    for (const checkout of readdirSync(unpacked)) {
        const pack = join(unpacked, checkout, 'behavior_pack');
        if (existsSync(join(pack, 'entities'))) return pack;
    }
    return undefined;
};

/** The unpacked `bedrock-samples` archive in the cache, under its version folder. */
const cachedSamples = (root: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const version of pinnedFirst(root, bedrockSamplesCacheFolder)) {
        const unpacked = join(root, version, 'unpacked');
        if (existsSync(unpacked) && samplesPackIn(unpacked) !== undefined) return unpacked;
    }
    return undefined;
};

/**
 * The default release's Java vanilla datapack, under its folder in `vanilla-datapack/`.
 *
 * Only the default release's folder counts. A cache that generated a preview but not the default
 * holds the preview alone, and loading it would run preview content and record its data version
 * in saves although `content-java-version` asked for the default.
 */
const defaultVanillaDatapack = (root: string): string | undefined => {
    const pack = join(root, javaServerCacheFolder);
    return existsSync(join(pack, 'pack.mcmeta')) ? pack : undefined;
};

/** The target a generated datapack's `version.json` describes, or undefined when it has none. */
const generatedTarget = (datapack: string): JavaDataTarget | undefined => {
    const record = readGeneratedJavaVersion(datapack);
    return record === undefined
        ? undefined
        : { release: record.release, format: record.dataPackFormat, dataVersion: record.dataVersion };
};

/**
 * Checks that `sources.json` pins a release.
 *
 * @returns The pinned releases, comma separated, for an error message.
 * @throws {PrismarineContentErrors.UnknownJavaRelease} When it does not.
 */
const pinnedJavaRelease = (release: string, releases: readonly string[]): string => {
    const pinned = releases.join(', ');
    if (!releases.includes(release)) throw new PrismarineContentErrors.UnknownJavaRelease({ release, pinned });
    return pinned;
};

/**
 * The vanilla datapack of the release `content-java-version` names.
 *
 * A named release is a statement of intent, like an environment override: running the default
 * release's data instead would generate a world for a release nobody asked for, so a name that is
 * not pinned, or a release that is not generated, stops the server.
 *
 * @throws {PrismarineContentErrors.UnknownJavaRelease} When `sources.json` does not pin it.
 * @throws {PrismarineContentErrors.JavaReleaseNotGenerated} When its datapack or `version.json`
 *   is not in the cache.
 */
const namedJavaRelease = (release: string, root: string, releases: readonly string[]): string => {
    const pinned = pinnedJavaRelease(release, releases);
    const path = join(root, 'vanilla-datapack', release);
    if (!existsSync(join(path, 'pack.mcmeta')) || generatedTarget(path) === undefined) {
        throw new PrismarineContentErrors.JavaReleaseNotGenerated({ release, path, pinned });
    }
    return path;
};

/**
 * Reads one Bedrock path as the pack or packs it holds.
 *
 * A `manifest.json` at the root makes it one composed pack, the form
 * `bedrock-samples` publishes and the form somebody points
 * {@link PACK_STACK_ENV.vanillaBedrockPack} at when they have unpacked one.
 * Without it the path is a folder of layer folders the way BDS ships them,
 * and `packs` says which of the packs in it to compose.
 */
const bedrockSource = (path: string, packs: readonly string[] | 'all'): BedrockPackSource =>
    existsSync(join(path, 'manifest.json'))
        ? { kind: 'directory', path }
        : { kind: 'brarchiveLayers', path, uuids: packs === 'all' ? undefined : packs };

/** The overlay's path inside whichever `node_modules` holds `@jsprismarine/blocks`. */
const OVERLAY_SEGMENTS = ['@jsprismarine', 'blocks', 'vanilla_overlay'] as const;

/** The `jsprismarine_vanilla` overlay, which `@jsprismarine/blocks` publishes beside its `dist`. */
export const overlayPackPath = (): string => {
    const manifest = resolveFrom('@jsprismarine/blocks/package.json');
    if (manifest !== undefined) return join(dirname(manifest), 'vanilla_overlay');

    return searchUp(...OVERLAY_SEGMENTS) ?? join(process.cwd(), 'node_modules', ...OVERLAY_SEGMENTS);
};

/** The `@jsprismarine/entities` overlay, which declares entity types absent from Bedrock's pack. */
export const entityOverlayPackPath = (): string => {
    const manifest = resolveFrom('@jsprismarine/entities/package.json');
    if (manifest !== undefined) return join(dirname(manifest), 'vanilla_overlay');

    return (
        searchUp('@jsprismarine', 'entities', 'vanilla_overlay') ??
        join(process.cwd(), 'node_modules', '@jsprismarine', 'entities', 'vanilla_overlay')
    );
};

/**
 * Assembles the default pack stack.
 *
 * @returns The stack in apply order, and one `pack.missing` warning per
 *   member whose directory is not on disk.
 */
export const resolvePackStack = (request: PackStackRequest = {}): ResolvedPackStack => {
    const stack: PackSource[] = [];
    const diagnostics: Diagnostic[] = [];
    const overlayDirectories: string[] = [];
    let prefixLength = 0;
    const root = request.cacheRoot ?? cacheRoot();
    const releases = request.pinnedJavaReleases ?? pinnedJavaReleases;

    const missing = (member: string, where: string): void => {
        diagnostics.push({
            severity: 'warning',
            code: 'pack.missing',
            pack: member,
            message: `${member} is not on disk; ${where}`
        });
    };

    if (request.vanilla !== false) {
        const override = process.env[PACK_STACK_ENV.vanillaBedrockPack];
        const layers = sourcePath(override, () => bdsBehaviorPacks(join(root, 'bds')));
        const samplesRoot = sourcePath(process.env[PACK_STACK_ENV.bedrockSamples], () =>
            cachedSamples(join(root, 'bedrock-samples'))
        );
        const samples = samplesRoot === undefined ? undefined : samplesPackIn(samplesRoot);
        // An override names the pack to run, so a missing one is reported rather than replaced.
        const loose = layers || override ? undefined : samples;

        if (layers) {
            const source = bedrockSource(layers, request.bedrockPacks ?? [VANILLA_BEHAVIOR_PACK_UUID]);
            // Under the server's own layers, which win wherever they are readable: BDS ships some
            // definitions as binary files this loader cannot read, and leaves others out, so the
            // villagers of three professions had no trades at all. That holds whether the layers
            // came from the cache or from the override.
            if (samples && source.kind === 'brarchiveLayers') stack.push({ kind: 'directory', path: samples });
            stack.push(source);
            prefixLength = stack.length;
        } else if (loose) {
            stack.push({ kind: 'directory', path: loose });
            prefixLength = stack.length;
        } else {
            missing(
                'the vanilla Bedrock behavior pack',
                `without it no mob spawns, \`/summon\` refuses every entity and the End has no dragon; run \`pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack\` or set ${PACK_STACK_ENV.vanillaBedrockPack}`
            );
        }
    }

    if (request.overlay !== false) {
        const overlay = overlayPackPath();
        if (existsSync(overlay)) {
            stack.push({ kind: 'directory', path: overlay });
            overlayDirectories.push(overlay);
            prefixLength = stack.length;
        } else missing('the jsprismarine_vanilla overlay', 'reinstall @jsprismarine/blocks');

        const entityOverlay = entityOverlayPackPath();
        if (existsSync(entityOverlay)) {
            stack.push({ kind: 'directory', path: entityOverlay });
            overlayDirectories.push(entityOverlay);
            prefixLength = stack.length;
        } else missing('the jsprismarine entity overlay', 'reinstall @jsprismarine/entities');
    }

    let java: JavaDataTarget | undefined;
    if (request.javaVanilla !== false) {
        const override = process.env[PACK_STACK_ENV.vanillaDatapack];
        const overridden = override !== undefined && override !== '';
        // The override names the datapack outright, so a named release is only checked for being
        // pinned; whether the cache holds it does not matter.
        if (overridden && request.javaVersion !== undefined) pinnedJavaRelease(request.javaVersion, releases);
        const named =
            overridden || request.javaVersion === undefined
                ? undefined
                : namedJavaRelease(request.javaVersion, root, releases);
        const datapack = overridden
            ? sourcePath(override, () => undefined)
            : (named ?? defaultVanillaDatapack(join(root, 'vanilla-datapack')));
        if (datapack) {
            stack.push({ kind: 'datapack', path: datapack });
            prefixLength = stack.length;
            java = generatedTarget(datapack);
            if (java === undefined) {
                // A cache generated before `datagen:java` wrote the record, or a datapack somebody
                // pointed the override at. Its format is unknown, so the default target gates it.
                java = DEFAULT_JAVA_DATA_TARGET;
                diagnostics.push({
                    severity: 'warning',
                    code: 'pack.java-version-missing',
                    pack: datapack,
                    message: `the Java vanilla datapack has no version.json; loading it as Java ${java.release} (format ${java.format.join('.')})`
                });
            }
        } else if (overridden) {
            missing('the Java vanilla datapack', `${PACK_STACK_ENV.vanillaDatapack} points at nothing`);
        } else {
            missing(
                `the Java ${javaServerCacheFolder} vanilla datapack`,
                'run `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, set ' +
                    `\`content-java-version\` to another generated release, or set ${PACK_STACK_ENV.vanillaDatapack}`
            );
        }
    }

    const version = packsVersion();
    const cache: PrefixCacheOptions | undefined =
        prefixLength > 0 && version !== undefined
            ? {
                  filePath: join(root, 'composed-vanilla-prefix.v11'),
                  prefixLength,
                  fingerprint: fingerprintPackDirectories(overlayDirectories),
                  validatorKey: 'structural-validator-v1'
              }
            : undefined;

    stack.push(...(request.worldPacks ?? []), ...(request.pluginPacks ?? []));

    return {
        stack,
        diagnostics,
        ...(cache === undefined ? {} : { cache }),
        ...(java === undefined ? {} : { java })
    };
};
