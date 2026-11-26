/**
 * The resource packs the server sends to Bedrock clients as they join: the installed addons'
 * resource packs, each zipped once and cut into chunks the client asks for one at a time.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { writeZip } from '@jsprismarine/packs/zip';
import type { PackIdVersion } from '@jsprismarine/protocol/bedrock/packet/ResourcePacksInfoPacket';

import type { AddonResourcePack } from '../addons/AddonManager';

/**
 * How many bytes of a pack one `ResourcePackChunkDataPacket` carries. 256 KiB, as Geyser,
 * PocketMine-MP and PowerNukkitX send: large chunks beat many small ones, which a client can fall
 * behind on.
 */
export const RESOURCE_PACK_CHUNK_SIZE = 256 * 1024;

/** One resource pack as a client downloads it. */
export interface ServedResourcePack {
    /** The addon it came from. */
    readonly key: string;
    readonly name: string;
    /** Its manifest header's UUID, in lowercase. */
    readonly uuid: string;
    readonly version: string;
    /** The UUID and version joined by an underscore, which the client asks for chunks by. */
    readonly resourceName: string;
    /** The pack as one zip, which the chunks are cut from. */
    readonly bytes: Uint8Array;
    /** The zip's SHA-256, which the client checks the download against. */
    readonly sha256: Buffer;
    readonly chunkCount: number;
}

/** A UUID's two halves, as `PackIdVersion` carries them, with the version beside them. */
export const packIdVersionOf = (uuid: string, version: string): PackIdVersion => {
    const hex = uuid.replaceAll('-', '');
    return {
        uuidMostSignificant: BigInt(`0x${hex.slice(0, 16)}`),
        uuidLeastSignificant: BigInt(`0x${hex.slice(16, 32)}`),
        version
    };
};

/** Every file of a folder, by its path inside it with `/` separators, in name order. */
const filesOf = async (directory: string): Promise<Map<string, Uint8Array>> => {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    const files = new Map<string, Uint8Array>();
    const paths = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort();
    for (const file of paths)
        files.set(path.relative(directory, file).split(path.sep).join('/'), new Uint8Array(await readFile(file)));
    return files;
};

/** Zips one installed resource pack for sending. */
export const servedPackOf = async ({ key, directory, summary }: AddonResourcePack): Promise<ServedResourcePack> => {
    const bytes = writeZip(await filesOf(directory));
    return {
        key,
        name: summary.name,
        uuid: summary.uuid,
        version: summary.version,
        resourceName: `${summary.uuid}_${summary.version}`,
        bytes,
        sha256: createHash('sha256').update(bytes).digest(),
        chunkCount: Math.max(1, Math.ceil(bytes.byteLength / RESOURCE_PACK_CHUNK_SIZE))
    };
};

/**
 * The packs in the order the stack applies them, top first: as installed, except that a pack goes
 * above the packs it depends on, which it is built to override.
 */
export const stackOrderOf = <T extends { readonly uuid: string; readonly dependencies: readonly string[] }>(
    packs: readonly T[]
): T[] => {
    const ordered: T[] = [];
    const placed = new Set<T>();
    const place = (pack: T): void => {
        if (placed.has(pack)) return;
        placed.add(pack);
        for (const dependent of packs) if (dependent.dependencies.includes(pack.uuid)) place(dependent);
        ordered.push(pack);
    };
    for (const pack of packs) place(pack);
    return ordered;
};

/** One chunk of a pack, and where it starts in the zip. */
export interface ResourcePackChunk {
    readonly offset: number;
    readonly data: Uint8Array;
}

/**
 * The packs the server offers, rebuilt whenever the installed list changes. Each build zips every
 * pack, so it runs once per change rather than once per join.
 *
 * A client asks for a pack's chunks after its login listed the pack, by which time the list it
 * was given may have been rebuilt, so every pack offered stays to be asked for until the server
 * stops.
 */
export class ServedResourcePacks {
    private readonly installed: () => readonly AddonResourcePack[];
    private built?: { readonly from: readonly AddonResourcePack[]; readonly packs: Promise<ServedResourcePack[]> };
    /** The packs the last finished build offers, in stack order. */
    private latest: readonly ServedResourcePack[] = [];
    /** Every pack a build offered, by its resource name. */
    private readonly offeredByName = new Map<string, ServedResourcePack>();

    /** @param installed - The installed addons' resource packs; a new list means they changed. */
    public constructor(installed: () => readonly AddonResourcePack[]) {
        this.installed = installed;
    }

    /** The packs to offer, in stack order, top first. */
    public packs(): Promise<readonly ServedResourcePack[]> {
        const from = this.installed();
        if (this.built?.from !== from) {
            const ordered = stackOrderOf(
                from.map((pack) => ({
                    pack,
                    uuid: pack.summary.uuid,
                    dependencies: pack.summary.dependencies.map(({ uuid }) => uuid)
                }))
            );
            const packs = Promise.all(ordered.map(({ pack }) => servedPackOf(pack))).then((served) => {
                // A build the list moved on from while it ran stays to be downloaded, but is not
                // what a login offers.
                if (this.built?.from === from) this.latest = served;
                for (const pack of served) this.offeredByName.set(pack.resourceName, pack);
                return served;
            });
            this.built = { from, packs };
        }
        return this.built.packs;
    }

    /** The packs the last finished build offers, in stack order: what a login lists now. */
    public offered(): readonly ServedResourcePack[] {
        return this.latest;
    }

    /**
     * A pack a build offered, as a client names it: `<uuid>_<version>`, or the bare UUID, which
     * some clients send and which names the pack's latest version.
     */
    public find(resourceName: string): ServedResourcePack | undefined {
        const wanted = resourceName.toLowerCase();
        return (
            this.offeredByName.get(wanted) ??
            (wanted.includes('_') ? undefined : this.latest.find((pack) => pack.uuid === wanted))
        );
    }
}

/** One chunk of a pack, or undefined for an index past its last. */
export const chunkOf = (pack: ServedResourcePack, index: number): ResourcePackChunk | undefined => {
    if (!Number.isInteger(index) || index < 0 || index >= pack.chunkCount) return undefined;
    const offset = index * RESOURCE_PACK_CHUNK_SIZE;
    return { offset, data: pack.bytes.subarray(offset, offset + RESOURCE_PACK_CHUNK_SIZE) };
};
