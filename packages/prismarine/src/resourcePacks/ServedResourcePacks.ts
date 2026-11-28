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
import { CONTENTS_FILE, contentKeyFileOf, encryptedContentId, readContentKey } from './contentKey';
import type { WorldResourcePack } from './worldResourcePacks';
import { readWorldResourcePacks, subpackOf } from './worldResourcePacks';

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
    /** Whether its manifest calls it part of an addon, which the client is told it is. */
    readonly addon: boolean;
    /** Whether its manifest lists the `raytraced` capability. */
    readonly rayTracing: boolean;
    /** The `folder_name` of each subpack its manifest lists. */
    readonly subpacks: readonly string[];
    /**
     * The `Content Identity` the client is told: the content id an encrypted pack's
     * `contents.json` names, otherwise the pack's UUID, as BDS sends it.
     */
    readonly contentIdentity: string;
    /** The 32-byte key an encrypted pack is decrypted with, or an empty string for none. */
    readonly contentKey: string;
    /** Why an encrypted pack goes out without a key, which a client cannot then read. */
    readonly keyProblem?: string;
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

/**
 * Zips one installed resource pack for sending, with its key when it is encrypted.
 *
 * The zip is the pack's folder as it is on disk, ciphertext included, which the client checks
 * against the SHA-256 it is sent. The key file sits beside the folder, so it never goes into the
 * zip.
 */
export const servedPackOf = async ({ key, directory, summary }: AddonResourcePack): Promise<ServedResourcePack> => {
    const files = await filesOf(directory);
    const bytes = writeZip(files);
    const encryptedAs = encryptedContentId(files.get(CONTENTS_FILE));
    let contentKey = '';
    let keyProblem: string | undefined;
    if (encryptedAs !== undefined) {
        const read = await readContentKey(directory);
        if ('key' in read) contentKey = read.key;
        else
            keyProblem = `${contentKeyFileOf(directory)} ${'missing' in read ? 'is missing' : `does not hold its key: ${read.invalid}`}`;
    }
    return {
        key,
        name: summary.name,
        uuid: summary.uuid,
        version: summary.version,
        resourceName: `${summary.uuid}_${summary.version}`,
        addon: summary.addon,
        rayTracing: summary.rayTracing,
        subpacks: summary.subpacks,
        contentIdentity: encryptedAs ?? summary.uuid,
        contentKey,
        ...(keyProblem === undefined ? {} : { keyProblem }),
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

/** What {@link ServedResourcePacks} reads besides the installed packs. */
export interface ServedResourcePacksOptions {
    /**
     * Whether any installed pack, behavior or resource, calls itself part of an addon, which a
     * login tells the client as BDS does; left out, none does.
     */
    readonly addonPacks?: () => boolean;
    /** The folder of the world whose `world_resource_packs.json` picks each pack's subpack. */
    readonly worldFolder?: () => string | undefined;
    /** Says what the owner should fix, such as an encrypted pack with no key. */
    readonly warn?: (message: string) => void;
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
    private readonly options: ServedResourcePacksOptions;
    private built?: { readonly from: readonly AddonResourcePack[]; readonly packs: Promise<ServedResourcePack[]> };
    /** The packs the last finished build offers, in stack order. */
    private latest: readonly ServedResourcePack[] = [];
    /** Every pack a build offered, by its resource name. */
    private readonly offeredByName = new Map<string, ServedResourcePack>();
    /** The subpack the last {@link subpacks} read picked for each pack, by resource name. */
    private chosen: ReadonlyMap<string, string> = new Map();

    /**
     * @param installed - The installed addons' resource packs; a new list means they changed.
     * @param options - What else the offer reads.
     */
    public constructor(installed: () => readonly AddonResourcePack[], options: ServedResourcePacksOptions = {}) {
        this.installed = installed;
        this.options = options;
    }

    /** Whether the world holds an addon's packs, as a login's `Has Addon Packs` says. */
    public hasAddonPacks(): boolean {
        return this.options.addonPacks?.() ?? false;
    }

    /**
     * The subpack the world picks for each pack, by resource name, read from the world's
     * `world_resource_packs.json` each time, so an edit applies at the next join. A pack the file
     * picks no subpack for has none.
     * @param packs - The packs a login offers.
     */
    public async subpacks(packs: readonly ServedResourcePack[]): Promise<ReadonlyMap<string, string>> {
        const folder = this.options.worldFolder?.();
        let world: ReadonlyMap<string, WorldResourcePack> = new Map();
        if (folder !== undefined) {
            const read = await readWorldResourcePacks(folder);
            if (read.problem !== undefined) this.options.warn?.(read.problem);
            world = read.packs;
        }
        this.chosen = new Map(packs.map((pack) => [pack.resourceName, subpackOf(world, pack)]));
        return this.chosen;
    }

    /**
     * The subpack the last {@link subpacks} read picked for a pack, for the pack stack a login
     * sends after its pack list, which has to name the same one.
     */
    public chosenSubpack(resourceName: string): string {
        return this.chosen.get(resourceName) ?? '';
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
                for (const pack of served)
                    if (pack.keyProblem !== undefined)
                        this.options.warn?.(
                            `${pack.key}'s resource pack ${pack.name} is encrypted and ${pack.keyProblem}, so players cannot read it`
                        );
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
