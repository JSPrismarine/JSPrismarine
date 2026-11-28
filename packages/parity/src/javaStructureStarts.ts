import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JAVA_STRUCTURE_STARTS_PATH } from './references.ts';

/** A structure and the chunk it starts in, or is known not to start in. */
export interface StructureChunk {
    readonly structure: string;
    readonly chunkX: number;
    readonly chunkZ: number;
}

/**
 * Which structures Java starts in which chunks for one seed, as the pinned Java dedicated
 * server's `/locate structure` answered. `scripts/capture-java-structure-starts.ts` writes it.
 */
export interface JavaStructureStarts {
    readonly provenance: {
        readonly edition: 'java';
        readonly version: string;
        readonly seed: number;
        readonly dimension: string;
        /** The command that wrote the file. */
        readonly source: string;
    };
    /** Chunks Java starts the structure in. */
    readonly starts: readonly StructureChunk[];
    /** Chunks a placement offered the structure's set, where Java starts no such structure. */
    readonly absent: readonly StructureChunk[];
}

/**
 * The scenario names `worldgen.structureStarts.test.ts` files its rows under.
 *
 * Its gaps share the `worldgen.structures` family with the generation corpus' own, so each
 * suite reads the other's names to leave those rows alone.
 */
export const JAVA_STRUCTURE_SCENARIOS = { starts: 'java-start', absent: 'java-no-start' } as const;

/** Reads the committed capture. */
export const loadJavaStructureStarts = (): JavaStructureStarts =>
    // Parsed JSON boundary; the capture script is the file's only writer.
    JSON.parse(
        readFileSync(join(import.meta.dirname, '..', '..', '..', JAVA_STRUCTURE_STARTS_PATH), 'utf-8')
    ) as JavaStructureStarts;
