import type { WorldConfig } from '../../World';
import type Server from '../../../Server';
import type { ChunkRequestOptions, Generator } from '../../Generator';
import type Chunk from '../../chunk/Chunk';
import type { DimensionType } from '../../Dimension';
import { Dimensions } from '../../Dimension';
import BaseProvider from '../BaseProvider';

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FOLDERS = ['data', 'entities', 'playerdata', 'region'];

/** The folders Java kept the Nether and the End in before 26.1 moved them under `dimensions/`. */
const LEGACY_DIMENSION_FOLDERS: Readonly<Record<string, string>> = {
    'minecraft:the_nether': 'DIM-1',
    'minecraft:the_end': 'DIM1'
};

/** A region file name, `r.<rx>.<rz>.mca`, with its region coordinates captured. */
const REGION_FILE_NAME = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

/** One region file spans 32 by 32 chunks. */
const REGION_CHUNKS = 32;

/** The location table at the start of a region file: one 4-byte entry per chunk. */
const LOCATION_TABLE_BYTES = REGION_CHUNKS * REGION_CHUNKS * 4;

/**
 * Reads the region file's location table and yields the chunks it marks present.
 *
 * A file too short to hold the table, or one that cannot be opened, yields nothing. The chunk
 * bodies the table points at are not read.
 */
function* chunksOfRegion(file: string, rx: number, rz: number): IterableIterator<{ x: number; z: number }> {
    const table = Buffer.alloc(LOCATION_TABLE_BYTES);
    let handle: number;
    try {
        handle = fs.openSync(file, 'r');
    } catch {
        return;
    }

    try {
        if (fs.readSync(handle, table, 0, LOCATION_TABLE_BYTES, 0) < LOCATION_TABLE_BYTES) return;
    } finally {
        fs.closeSync(handle);
    }

    for (let index = 0; index < REGION_CHUNKS * REGION_CHUNKS; index++) {
        if (table.readUInt32BE(index * 4) === 0) continue;

        yield {
            x: rx * REGION_CHUNKS + (index % REGION_CHUNKS),
            z: rz * REGION_CHUNKS + Math.floor(index / REGION_CHUNKS)
        };
    }
}

export default class Anvil extends BaseProvider {
    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);
    }

    private async prepareFolderStructure() {
        if (!fs.existsSync(this.path)) {
            await fs.promises.mkdir(this.path, { recursive: true });
        }

        await Promise.all(
            DEFAULT_FOLDERS.map((dir) => path.join(this.path, dir))
                .filter((dir) => !fs.existsSync(dir))
                .map((dir) => fs.promises.mkdir(dir, { recursive: true }))
        );
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.prepareFolderStructure();
    }
    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {}

    /**
     * Returns the absolute path of the folder holding the dimension's region files.
     *
     * The Overworld keeps the save's top-level `region`. Every other dimension lives under
     * `dimensions/<namespace>/<path>/region`, the layout Java uses since 26.1; an id without a
     * namespace is read as `minecraft`. For the Nether and the End, a save written before 26.1
     * keeps `DIM-1/region` and `DIM1/region`, and the method answers that folder when it exists
     * and the newer one does not.
     */
    public regionDirectory(dimension: DimensionType): string {
        if (dimension.id === Dimensions.Overworld.id) return path.join(this.path, 'region');

        const separator = dimension.id.indexOf(':');
        const namespace = separator === -1 ? 'minecraft' : dimension.id.slice(0, separator);
        const name = separator === -1 ? dimension.id : dimension.id.slice(separator + 1);
        const directory = path.join(this.path, 'dimensions', namespace, name, 'region');

        const legacy = LEGACY_DIMENSION_FOLDERS[dimension.id];
        if (legacy === undefined || fs.existsSync(directory)) return directory;

        const legacyDirectory = path.join(this.path, legacy, 'region');
        return fs.existsSync(legacyDirectory) ? legacyDirectory : directory;
    }

    /**
     * Yields every chunk the dimension's region files mark present.
     *
     * Each `r.<rx>.<rz>.mca` under {@link regionDirectory} contributes the entries of its location
     * table, so a region file with no chunk records adds nothing. Only the table is read, not
     * the chunk bodies, so a chunk listed here is not yet one `readChunk` can decode.
     */
    public *listChunks(dimension: DimensionType): IterableIterator<{ x: number; z: number }> {
        const directory = this.regionDirectory(dimension);
        if (!fs.existsSync(directory)) return;

        for (const entry of fs.readdirSync(directory)) {
            const match = REGION_FILE_NAME.exec(entry);
            if (match === null) continue;

            yield* chunksOfRegion(path.join(directory, entry), Number(match[1]), Number(match[2]));
        }
    }

    public async readChunk(
        _dimension: DimensionType,
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk> {
        return generator.generateChunk(cx, cz, seed, config, options);
    }
    public async writeChunk(_chunk: Chunk): Promise<void> {
        // TODO.
        return;
    }
}
