/**
 * The pack block fixtures and their golden: behavior packs under `scenarios/pack-blocks/` whose
 * blocks a Bedrock Dedicated Server defines for a joining client, and the definitions it sent.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node as the scripting capture runs `scripting/record.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from './isRecord.ts';

/** The namespace every fixture block is in, which picks them out of the server's list. */
export const PACK_BLOCK_NAMESPACE = 'parity';

/** Where the fixture packs live, one directory per pack. */
export const PACK_BLOCKS_DIRECTORY = join(import.meta.dirname, '..', 'scenarios', 'pack-blocks');

/** Where the capture writes the server's definitions. */
export const PACK_BLOCKS_GOLDEN = join(import.meta.dirname, '..', 'goldens', 'pack-blocks.json');

/** One fixture pack, as its manifest names it. */
export interface PackBlockPack {
    /** Its directory name, which it is staged under. */
    readonly name: string;
    readonly directory: string;
    readonly uuid: string;
    readonly version: readonly number[];
    readonly minEngineVersion: readonly [number, number, number];
}

/** One fixture block file. */
export interface PackBlockFile {
    readonly identifier: string;
    readonly pack: PackBlockPack;
    /** The pack-relative path. */
    readonly path: string;
    /** The file's parsed JSON. */
    readonly data: unknown;
}

/** The checked-in golden. */
export interface PackBlocksGolden {
    readonly $comment: readonly string[];
    readonly server: { readonly protocolVersion: number; readonly serverVersion: string };
    /** Each block's definition, by identifier, as `nbtToPlain` reads it. */
    readonly blocks: Readonly<Record<string, unknown>>;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const isVersion = (value: unknown): value is readonly [number, number, number] =>
    Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === 'number');

const packOf = (name: string): PackBlockPack => {
    const directory = join(PACK_BLOCKS_DIRECTORY, name);
    const manifest = readJson(join(directory, 'manifest.json'));
    const header = isRecord(manifest) ? manifest.header : undefined;
    if (
        !isRecord(header) ||
        typeof header.uuid !== 'string' ||
        !Array.isArray(header.version) ||
        !isVersion(header.min_engine_version)
    ) {
        throw new Error(`${directory}/manifest.json has no uuid, version and min_engine_version.`);
    }
    return {
        name,
        directory,
        uuid: header.uuid,
        version: header.version.filter((part): part is number => typeof part === 'number'),
        minEngineVersion: header.min_engine_version
    };
};

const identifierOf = (data: unknown, path: string): string => {
    const block = isRecord(data) ? data['minecraft:block'] : undefined;
    const description = isRecord(block) ? block.description : undefined;
    const identifier = isRecord(description) ? description.identifier : undefined;
    if (typeof identifier !== 'string') throw new Error(`${path} names no block.`);
    return identifier;
};

/** Every fixture pack and block, in name order. */
export const packBlockFixtures = (): { packs: PackBlockPack[]; blocks: PackBlockFile[] } => {
    const packs = readdirSync(PACK_BLOCKS_DIRECTORY).sort().map(packOf);
    const blocks = packs.flatMap((pack) =>
        readdirSync(join(pack.directory, 'blocks'))
            .sort()
            .map((file) => {
                const path = `blocks/${file}`;
                const data = readJson(join(pack.directory, path));
                return { identifier: identifierOf(data, path), pack, path, data };
            })
    );
    return { packs, blocks };
};

/** Reads the checked-in golden. */
export const readPackBlocksGolden = (): PackBlocksGolden => {
    const golden = readJson(PACK_BLOCKS_GOLDEN);
    if (!isRecord(golden) || !isRecord(golden.blocks) || !isRecord(golden.server)) {
        throw new Error(`${PACK_BLOCKS_GOLDEN} is not a pack block golden.`);
    }
    const { protocolVersion, serverVersion } = golden.server;
    if (typeof protocolVersion !== 'number' || typeof serverVersion !== 'string') {
        throw new Error(`${PACK_BLOCKS_GOLDEN} names no server.`);
    }
    const comment = Array.isArray(golden.$comment) ? golden.$comment.map(String) : [];
    return { $comment: comment, server: { protocolVersion, serverVersion }, blocks: golden.blocks };
};

/** The golden as the capture writes it: blocks in name order, four-space JSON. */
export const renderPackBlocksGolden = (golden: PackBlocksGolden): string =>
    `${JSON.stringify(
        {
            ...golden,
            blocks: Object.fromEntries(Object.entries(golden.blocks).sort(([a], [b]) => (a < b ? -1 : 1)))
        },
        null,
        4
    )}\n`;
