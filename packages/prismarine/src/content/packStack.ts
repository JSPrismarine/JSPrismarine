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
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { Diagnostic } from '@jsprismarine/content';
import type { BedrockPackSource, PackSource, PackStack } from '@jsprismarine/packs';
import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs';

/** Points the resolver at a local copy of one fetched source. */
export const PACK_STACK_ENV = {
    /** A composed vanilla Bedrock behavior pack directory, or a folder of BDS vanilla layers. */
    vanillaBedrockPack: 'JSP_VANILLA_BEHAVIOR_PACK',
    /** A Java vanilla datapack directory, as the Java data generator writes one. */
    vanillaDatapack: 'JSP_VANILLA_DATAPACK'
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
    /** The world's own behavior packs and datapacks, applied after the vanilla members. */
    readonly worldPacks?: readonly PackSource[];
    /** Plugin packs, applied last so a plugin overrides a world. */
    readonly pluginPacks?: readonly PackSource[];
}

/** The stack, plus a report of the members that could not be found. */
export interface ResolvedPackStack {
    readonly stack: PackStack;
    readonly diagnostics: readonly Diagnostic[];
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
 * The BDS `behavior_packs` directory, whose `vanilla` and `vanilla_<version>`
 * folders are the layers of the composed vanilla pack. BDS keeps chemistry,
 * the editor, the script libraries and the experimental packs in the same
 * place, so the caller gets the whole folder and names the packs it wants
 * out of it.
 */
const bdsBehaviorPacks = (root: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked', 'behavior_packs');
        if (existsSync(unpacked)) return unpacked;
    }
    return undefined;
};

/** The `bedrock-samples` loose behavior pack, which is the same content unarchived. */
const samplesBehaviorPack = (root: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'entities'))) return pack;
        }
    }
    return undefined;
};

/** The Java vanilla datapack the data generator wrote, under its Java version folder. */
const vanillaDatapack = (root: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const version of readdirSync(root)) {
        const pack = join(root, version);
        if (existsSync(join(pack, 'pack.mcmeta'))) return pack;
    }
    return undefined;
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

    const missing = (member: string, where: string): void => {
        diagnostics.push({
            severity: 'warning',
            code: 'pack.missing',
            pack: member,
            message: `${member} is not on disk; ${where}`
        });
    };

    if (request.vanilla !== false) {
        const root = cacheRoot();
        const override = process.env[PACK_STACK_ENV.vanillaBedrockPack];
        const layers = sourcePath(override, () => bdsBehaviorPacks(join(root, 'bds')));
        const loose = layers || override ? undefined : samplesBehaviorPack(join(root, 'bedrock-samples'));

        if (layers) stack.push(bedrockSource(layers, request.bedrockPacks ?? [VANILLA_BEHAVIOR_PACK_UUID]));
        else if (loose) stack.push({ kind: 'directory', path: loose });
        else {
            missing(
                'the vanilla Bedrock behavior pack',
                `run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` or set ${PACK_STACK_ENV.vanillaBedrockPack}`
            );
        }
    }

    if (request.overlay !== false) {
        const overlay = overlayPackPath();
        if (existsSync(overlay)) stack.push({ kind: 'directory', path: overlay });
        else missing('the jsprismarine_vanilla overlay', 'reinstall @jsprismarine/blocks');

        const entityOverlay = entityOverlayPackPath();
        if (existsSync(entityOverlay)) stack.push({ kind: 'directory', path: entityOverlay });
        else missing('the jsprismarine entity overlay', 'reinstall @jsprismarine/entities');
    }

    if (request.javaVanilla !== false) {
        const override = process.env[PACK_STACK_ENV.vanillaDatapack];
        const datapack = sourcePath(override, () => vanillaDatapack(join(cacheRoot(), 'vanilla-datapack')));
        if (datapack) stack.push({ kind: 'datapack', path: datapack });
        else {
            missing(
                'the Java vanilla datapack',
                'run `pnpm --filter @jsprismarine/bedrock-data run datagen:java` or set ' +
                    PACK_STACK_ENV.vanillaDatapack
            );
        }
    }

    stack.push(...(request.worldPacks ?? []), ...(request.pluginPacks ?? []));

    return { stack, diagnostics };
};
