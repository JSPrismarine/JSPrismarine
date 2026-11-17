/**
 * Counts the whole corpus: fetches each pinned repository, counts each pack in it, and renders the
 * checked-in files. The command line and the staleness test share it.
 */
import type { ModuleHistory } from '../../src/shape/format.ts';
import type { CorpusFetchOptions } from './fetch.mts';
import { fetchCorpusRepository } from './fetch.mts';
import type { CorpusManifest, CorpusRepository } from './manifest.mts';
import type { PackUsage } from './pack.mts';
import { countPack } from './pack.mts';
import type { ShapeSource } from './report.mts';
import { rankingMarkdown, usageJson } from './report.mts';

/** How {@link countCorpus} fetches, and what it reports as it goes. */
export interface CountCorpusOptions extends CorpusFetchOptions {
    /** Called with each repository's root once it is in the cache. */
    readonly onRepository?: (repository: CorpusRepository, root: string) => void;
}

/**
 * Counts every pack the manifest pins, fetching a repository into the cache first when it is
 * missing.
 * @throws {Error} Naming the pack, when a fetch fails or a pack's manifest or sources are missing.
 */
export const countCorpus = async (
    manifest: CorpusManifest,
    histories: Readonly<Record<string, ModuleHistory>>,
    options: CountCorpusOptions = {}
): Promise<PackUsage[]> => {
    const packs: PackUsage[] = [];
    for (const repository of manifest.repositories) {
        const root = await fetchCorpusRepository(repository, options);
        options.onRepository?.(repository, root);
        for (const pack of repository.packs) packs.push(countPack(pack, root, histories));
    }
    return packs;
};

/** The checked-in files the counts render to, by name inside `corpus/`. */
export const corpusFiles = (
    manifest: CorpusManifest,
    packs: readonly PackUsage[],
    shape: ShapeSource
): Map<string, string> =>
    new Map([
        ['usage.json', usageJson(packs, shape)],
        ['ranking.md', rankingMarkdown(manifest, packs, shape)]
    ]);
