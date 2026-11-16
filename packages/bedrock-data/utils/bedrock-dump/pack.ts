/**
 * Writes the dump behavior pack into a staged server and enables it for the world.
 *
 * Which entry script runs is the only difference between the passes. Rather than keeping a
 * manifest per pass in step by hand, this module writes the manifest for the pass it is asked
 * for and copies that pass's script beside it. The reference world pass stages no pack at all:
 * `run.ts` drives it entirely over the server console, because nothing the Script API exposes
 * says when a chunk is fully generated.
 *
 * The block palette's two passes work the same way, which is what lets `run.ts` capture it with
 * no hand-edited manifest. Their scripts live in `packages/minecraft/datagen/palette-pack`,
 * beside the snapshot they produce.
 *
 * {@link stageBehaviorPacks} copies packs that already exist as directories, such as the
 * scripting scenario packs of `packages/parity`, which run on this same staging.
 *
 * Nothing here writes into the extracted Bedrock Dedicated Server tree. The pack goes into the
 * staged run directory, which is this job's own.
 */
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Directory name the pack is staged under, inside `development_behavior_packs/`. */
export const PACK_DIRECTORY = 'jsp-dump';

/**
 * The pack's identity, which `world_behavior_packs.json` repeats to enable it. Fixed rather than
 * generated: a world that already lists this id keeps working after a recapture.
 */
export const PACK_UUID = '7b1c6e42-9d08-4a35-8f6c-2e5b19d4a701';

const MODULE_UUID = '7b1c6e42-9d08-4a35-8f6c-2e5b19d4a702';
const PACK_VERSION = [1, 0, 0];

/**
 * The `@minecraft/server` version the scripts ask for. The stable 2.x module needs no world
 * experiment, which is what keeps the staged world a plain one.
 */
const SERVER_MODULE_VERSION = '2.0.0';

/**
 * Which pass to run. `dump` uses the script beside this module; `place` and `domains` are the
 * two halves of the block palette capture, whose scripts belong to `packages/minecraft` because
 * its snapshot is what they produce.
 */
export type DumpPass = 'dump' | 'place' | 'domains';

/** The palette passes, whose scripts come from `packages/minecraft/datagen/palette-pack`. */
const PALETTE_PASSES = new Set<DumpPass>(['place', 'domains']);

/** Where a pass's entry script is copied from. */
export const passScriptSource = (pass: DumpPass): string =>
    PALETTE_PASSES.has(pass)
        ? join(here, '../../../minecraft/datagen/palette-pack/scripts', `${pass}.js`)
        : join(here, 'pack', 'scripts', `${pass}.js`);

/** The pack manifest for one pass. */
export const renderManifest = (pass: DumpPass): string => {
    const manifest = {
        format_version: 2,
        header: {
            name: 'JSPrismarine capture',
            description: `Capture pass: ${pass}. Written by packages/bedrock-data/utils/bedrock-dump.`,
            uuid: PACK_UUID,
            version: PACK_VERSION,
            min_engine_version: [1, 21, 0]
        },
        modules: [
            {
                type: 'script',
                language: 'javascript',
                uuid: MODULE_UUID,
                version: PACK_VERSION,
                entry: `scripts/${pass}.js`
            }
        ],
        dependencies: [{ module_name: '@minecraft/server', version: SERVER_MODULE_VERSION }]
    };
    return `${JSON.stringify(manifest, undefined, 4)}\n`;
};

/** A behavior pack as `world_behavior_packs.json` names it: its header UUID and version. */
export interface PackIdentity {
    readonly uuid: string;
    readonly version: readonly number[];
}

/**
 * What `world_behavior_packs.json` has to say for the world to load the given packs, in order.
 *
 * @param packs - The packs to enable. Defaults to the dump pack alone.
 */
export const renderWorldBehaviorPacks = (
    packs: readonly PackIdentity[] = [{ uuid: PACK_UUID, version: PACK_VERSION }]
): string =>
    `${JSON.stringify(
        packs.map((pack) => ({ pack_id: pack.uuid, version: pack.version })),
        undefined,
        4
    )}\n`;

/** A behavior pack directory to copy into a staged server, and the identity that enables it. */
export interface StagedPack extends PackIdentity {
    /** The pack directory to copy, holding its `manifest.json`. Read, never written. */
    readonly source: string;
    /** The directory name it gets under `development_behavior_packs/`. */
    readonly directory: string;
}

/**
 * Copies behavior packs into a staged server and enables all of them for one world.
 *
 * Each pack replaces whatever an earlier run left under its directory name, so a removed script
 * file cannot linger in the copy.
 *
 * @param serverRoot - The staged server directory, not the extracted archive.
 * @param worldDirectory - The world the packs are enabled for, usually `<serverRoot>/worlds/<level>`.
 * @param packs - The packs, in the order the world lists them.
 * @returns The directories the packs were copied to, in the same order.
 */
export const stageBehaviorPacks = async (
    serverRoot: string,
    worldDirectory: string,
    packs: readonly StagedPack[]
): Promise<string[]> => {
    const directories: string[] = [];
    for (const pack of packs) {
        const target = join(serverRoot, 'development_behavior_packs', pack.directory);
        await rm(target, { recursive: true, force: true });
        await cp(pack.source, target, { recursive: true });
        directories.push(target);
    }

    await mkdir(worldDirectory, { recursive: true });
    await writeFile(join(worldDirectory, 'world_behavior_packs.json'), renderWorldBehaviorPacks(packs));
    return directories;
};

/**
 * Stages the pack for one pass and enables it for a world.
 *
 * @param serverRoot - The staged server directory, not the extracted archive.
 * @param worldDirectory - The world the pack is enabled for, usually `<serverRoot>/worlds/<level>`.
 * @returns The directory the pack was written to.
 */
export const writeDumpPack = async (serverRoot: string, worldDirectory: string, pass: DumpPass): Promise<string> => {
    const packDirectory = join(serverRoot, 'development_behavior_packs', PACK_DIRECTORY);
    const scripts = join(packDirectory, 'scripts');
    await mkdir(scripts, { recursive: true });

    await writeFile(join(packDirectory, 'manifest.json'), renderManifest(pass));
    await copyFile(passScriptSource(pass), join(scripts, `${pass}.js`));

    await mkdir(worldDirectory, { recursive: true });
    await writeFile(join(worldDirectory, 'world_behavior_packs.json'), renderWorldBehaviorPacks());

    return packDirectory;
};
