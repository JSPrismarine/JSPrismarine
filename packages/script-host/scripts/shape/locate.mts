/**
 * Finds the pinned `bedrock-samples` checkout's script module metadata, through the same source
 * descriptor and cache layout that `@jsprismarine/bedrock-data`'s `fetch:sources` writes.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { fetchSource, resolveContentRoot, sourceCachePath } from '../../../bedrock-data/utils/fetch/fetch.ts';
import { loadSourceDescriptors } from '../../../bedrock-data/utils/fetch/manifest.ts';
import type { SourceDescriptor } from '../../../bedrock-data/utils/fetch/manifest.ts';
import { cacheRoot, packageDir as bedrockDataDir } from '../../../bedrock-data/utils/fetch/paths.ts';
import type { MetadataSource } from './generate.mts';

/** Where the module files sit inside a checkout. */
export const SCRIPT_MODULES_PATH = 'metadata/script_modules/@minecraft';

/** The pin the generated files record. */
export interface SamplesPin {
    readonly repo: string;
    readonly tag: string;
    readonly commit: string;
}

const manifestPath = join(bedrockDataDir, 'sources.json');

/** Reads the `bedrock-samples` pin from `sources.json`. */
export const readSamplesPin = (): SamplesPin => {
    // sources.json is the repository's own manifest, parsed JSON; only the pin is read.
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        bedrockSamples: { tag: string; commit: string };
    };
    return { repo: 'Mojang/bedrock-samples', tag: manifest.bedrockSamples.tag, commit: manifest.bedrockSamples.commit };
};

const samplesDescriptor = async (): Promise<SourceDescriptor> => {
    const descriptor = (await loadSourceDescriptors(manifestPath)).find((entry) => entry.name === 'bedrock-samples');
    if (descriptor === undefined) throw new Error(`${manifestPath} pins no bedrock-samples`);
    return descriptor;
};

/** A {@link MetadataSource} over a directory of module files. */
export const directorySource = (directory: string): MetadataSource => ({
    files: readdirSync(directory).sort(),
    // The files are parsed JSON, which the generator checks key by key.
    read: (file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown
});

/**
 * The module directory of the checkout that `JSP_BEDROCK_SAMPLES_PATH` names, or of the cached
 * pinned one, without downloading anything.
 * @returns The directory, or undefined when neither exists.
 */
export const findScriptModules = async (env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> => {
    const descriptor = await samplesDescriptor();
    const override = env[descriptor.envOverride];
    const content = override !== undefined && override !== '' ? override : sourceCachePath(descriptor, cacheRoot);
    if (!existsSync(content)) return undefined;
    const directory = join(await resolveContentRoot(content), SCRIPT_MODULES_PATH);
    return existsSync(directory) ? directory : undefined;
};

/**
 * The module directory, fetching the pinned checkout into the cache first when it is missing.
 * @throws {Error} When the download fails or the checkout has no script module metadata.
 */
export const fetchScriptModules = async (): Promise<string> => {
    const found = await findScriptModules();
    if (found !== undefined) return found;
    const fetched = await fetchSource(await samplesDescriptor(), { cacheRoot });
    const directory = join(await resolveContentRoot(fetched.contentPath), SCRIPT_MODULES_PATH);
    if (!existsSync(directory)) throw new Error(`${directory} is missing from the pinned bedrock-samples`);
    return directory;
};
