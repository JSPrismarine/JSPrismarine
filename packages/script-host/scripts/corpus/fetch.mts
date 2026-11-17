/**
 * Fetches the corpus's pinned repositories into the shared cache, through the same fetch,
 * digest check and cache layout that `@jsprismarine/bedrock-data`'s `fetch:sources` uses. Each
 * repository is the codeload zip of its pinned commit, so a force-push or a deleted branch upstream
 * cannot change what is read, and a commit that is gone fails the fetch.
 */
import type { FetchOptions } from '../../../bedrock-data/utils/fetch/fetch.ts';
import { fetchSource, isSourceCached, resolveContentRoot } from '../../../bedrock-data/utils/fetch/fetch.ts';
import type { SourceDescriptor } from '../../../bedrock-data/utils/fetch/manifest.ts';
import { cacheRoot as sharedCacheRoot } from '../../../bedrock-data/utils/fetch/paths.ts';
import type { CorpusManifest, CorpusRepository } from './manifest.mts';

/** The `<source>` cache segment the corpus lives under, one directory per repository and commit. */
export const CORPUS_SOURCE_NAME = 'addon-corpus';

/** The cache descriptor of one pinned repository. */
export const corpusDescriptor = (repository: CorpusRepository): SourceDescriptor => ({
    name: `${CORPUS_SOURCE_NAME}/${repository.name}`,
    version: repository.commit,
    url: `https://codeload.github.com/${repository.name}/zip/${repository.commit}`,
    hash: { algorithm: 'sha256', value: repository.sha256 },
    unpack: true,
    fileName: `${repository.name.replace('/', '-')}-${repository.commit}.zip`,
    // The corpus has no local override: an empty name matches no environment variable.
    envOverride: ''
});

/** Where the fetch writes, and what it downloads with; tests stub both. */
export type CorpusFetchOptions = Pick<FetchOptions, 'fetchImpl'> & {
    /** The shared cache root. `node_modules/.cache/jsprismarine` when absent. */
    readonly cacheRoot?: string;
};

/**
 * Makes sure one pinned repository is in the cache, downloading and checking it when it is not.
 * @returns The repository's root directory inside the cache.
 * @throws {Error} Naming the repository's packs and its commit, when the download fails (a commit
 * that no longer exists upstream gets HTTP 404) or the zip's digest differs from the pin.
 */
export const fetchCorpusRepository = async (
    repository: CorpusRepository,
    options: CorpusFetchOptions = {}
): Promise<string> => {
    try {
        const fetched = await fetchSource(corpusDescriptor(repository), {
            cacheRoot: options.cacheRoot ?? sharedCacheRoot,
            env: {},
            ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl })
        });
        return await resolveContentRoot(fetched.contentPath);
    } catch (error) {
        const packs = repository.packs.map((pack) => pack.id).join(', ');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Cannot fetch corpus pack ${packs} from ${repository.url} at ${repository.commit}: ${message}`,
            { cause: error }
        );
    }
};

/**
 * Whether every pinned repository has a verified copy in the cache, so reading the corpus needs no
 * network. It makes the check the fetch makes, so a fetch interrupted before it finished counts
 * as missing.
 */
export const isCorpusCached = async (
    manifest: CorpusManifest,
    cacheRoot: string = sharedCacheRoot
): Promise<boolean> => {
    for (const repository of manifest.repositories) {
        if (!(await isSourceCached(corpusDescriptor(repository), cacheRoot))) return false;
    }
    return true;
};
