/**
 * The Java resource pack the server offers Java clients: the installed addons' Bedrock resource
 * packs, converted into one Java pack by `@jsprismarine/java-packs`, kept on disk by a key of what
 * went into it, and served by the SHA-1 a client downloads it by.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { JavaCustomItem, JavaPackTarget } from '@jsprismarine/java-packs/convert';
import { convertResourcePacks, JAVA_PACK_CONVERTER_VERSION } from '@jsprismarine/java-packs/convert';
import { readZip, writeZip } from '@jsprismarine/packs/zip';

import { SerialQueue } from '../utils/serialQueue';
import type { ServedResourcePack } from './ServedResourcePacks';

/** One converted pack, as a Java client is offered it. */
export interface JavaResourcePack {
    /** The id `Add Resource Pack` names it by, made from the key so it is the same on every start. */
    readonly id: string;
    /** The key of what went into it, which names its file in the cache. */
    readonly key: string;
    /** Its SHA-1 in lowercase hexadecimal, which the client checks the download against. */
    readonly sha1: string;
    readonly bytes: Uint8Array;
}

/** What a {@link JavaResourcePacks} needs. */
export interface JavaResourcePacksOptions {
    /** The Bedrock packs the server offers, top first; a new list means they changed. */
    readonly bedrock: () => Promise<readonly ServedResourcePack[]>;
    /** The custom items the pack draws; none when absent. */
    readonly items?: () => readonly JavaCustomItem[];
    /** The Java release the pack is for. */
    readonly target: JavaPackTarget;
    /** The folder converted packs are kept in. */
    readonly cacheDirectory: string;
    readonly log: { info(message: string): void; debug(message: string): void };
}

/** A UUID's spelling of the first 128 bits of a hexadecimal key. */
const uuidOf = (hex: string): string =>
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/** The custom items in a fixed order, as the key and the build read them. */
const sortedItems = (items: readonly JavaCustomItem[]): JavaCustomItem[] =>
    [...items].sort((a, b) => (a.model < b.model ? -1 : a.model > b.model ? 1 : 0));

/**
 * The key of a conversion: what the converted bytes follow from, which is the converter's
 * version, the target pack format, each Bedrock pack's own hash, in stack order, and the custom
 * items the pack draws, by model.
 */
export const javaPackKey = (
    target: JavaPackTarget,
    bedrock: readonly ServedResourcePack[],
    items: readonly JavaCustomItem[] = []
): string =>
    createHash('sha256')
        .update(
            JSON.stringify([
                JAVA_PACK_CONVERTER_VERSION,
                target.format,
                bedrock.map(({ sha256 }) => sha256.toString('hex')),
                ...(items.length === 0 ? [] : [sortedItems(items).map(({ model, icon }) => [model, icon])])
            ])
        )
        .digest('hex');

/**
 * The converted pack for the current Bedrock packs, built when they change. A build first looks for
 * the pack in the cache folder, so a restart with the same addons converts nothing and serves the
 * same bytes, whose SHA-1 a returning client already has.
 *
 * Every pack built while the server runs stays to be served, for a client that was offered it and
 * is still downloading it; every other file in the folder goes when a build finishes.
 */
export class JavaResourcePacks {
    private readonly options: JavaResourcePacksOptions;
    private built?: {
        readonly from: readonly ServedResourcePack[];
        /** The custom items, as the key spells them. */
        readonly items: string;
        readonly pack: Promise<JavaResourcePack | undefined>;
    };
    /** Every pack a build gave, by SHA-1. */
    private readonly bySha1 = new Map<string, JavaResourcePack>();
    /** How many builds converted a stack, rather than finding it in the cache. */
    private conversionCount = 0;
    private readonly builds = new SerialQueue();

    public constructor(options: JavaResourcePacksOptions) {
        this.options = options;
    }

    /** How many stacks this converted, rather than reading their pack from the cache. */
    public get conversions(): number {
        return this.conversionCount;
    }

    /**
     * The pack to offer now, or undefined when no addon has a resource pack. A build that failed,
     * such as one whose cache write the disk refused, is not kept, so the next call builds again.
     */
    public async current(): Promise<JavaResourcePack | undefined> {
        const from = await this.options.bedrock();
        const items = sortedItems(this.options.items?.() ?? []);
        const itemsKey = JSON.stringify(items);
        if (this.built?.from !== from || this.built.items !== itemsKey) {
            // One build at a time, so one build's pruning never deletes the file another is writing.
            const pack = this.builds.run(() => this.build(from, items));
            const built = { from, items: itemsKey, pack };
            this.built = built;
            pack.catch(() => {
                if (this.built === built) this.built = undefined;
            });
        }
        return this.built.pack;
    }

    /** A pack a build gave, by its SHA-1. */
    public find(sha1: string): JavaResourcePack | undefined {
        return this.bySha1.get(sha1.toLowerCase());
    }

    private async build(
        served: readonly ServedResourcePack[],
        items: readonly JavaCustomItem[]
    ): Promise<JavaResourcePack | undefined> {
        const { cacheDirectory, target, log } = this.options;
        // An encrypted pack's files are ciphertext, which only a Bedrock client holding its key reads.
        for (const { name, contentKey } of served)
            if (contentKey !== '') log.info(`${name} is encrypted, so Java clients do not get it`);
        const bedrock = served.filter(({ contentKey }) => contentKey === '');
        if (bedrock.length === 0) {
            await this.prune();
            return undefined;
        }
        const key = javaPackKey(target, bedrock, items);
        const file = path.join(cacheDirectory, `${key}.zip`);
        let bytes: Uint8Array | undefined = await readFile(file).then(
            (read) => new Uint8Array(read),
            () => undefined
        );
        if (bytes === undefined) {
            const converted = convertResourcePacks(
                bedrock.map(({ name, bytes: zip }) => ({ name, files: readZip(zip) })),
                target,
                { items }
            );
            for (const { pack, converted: counts, notes } of converted.report) {
                log.info(
                    `Converted ${pack} for Java ${target.release}: ${counts.textures} textures, ${counts.vanillaOverrides} of Java's retextured, ${counts.languages} languages, ${counts.sounds} sounds, ${counts.items} custom items; ${notes.length} things left out or changed`
                );
                for (const { path: where, outcome, reason } of notes)
                    log.debug(`${pack}: ${outcome} ${where}: ${reason}`);
            }
            bytes = writeZip(converted.files);
            await mkdir(cacheDirectory, { recursive: true });
            // Through a file beside it, so a reader never sees half a pack.
            const partial = `${file}.partial`;
            await writeFile(partial, bytes);
            await rename(partial, file);
            this.conversionCount++;
        }
        const pack: JavaResourcePack = {
            id: uuidOf(key),
            key,
            sha1: createHash('sha1').update(bytes).digest('hex'),
            bytes
        };
        this.bySha1.set(pack.sha1, pack);
        await this.prune();
        return pack;
    }

    /**
     * Deletes every converted pack in the cache folder that no build of this run gave, and any
     * partial file a crashed run left. It runs inside a build, which no other build runs beside.
     */
    private async prune(): Promise<void> {
        const kept = new Set([...this.bySha1.values()].map(({ key }) => `${key}.zip`));
        const entries = await readdir(this.options.cacheDirectory).catch(() => []);
        for (const entry of entries) {
            if (!kept.has(entry)) await rm(path.join(this.options.cacheDirectory, entry), { force: true });
        }
    }
}
