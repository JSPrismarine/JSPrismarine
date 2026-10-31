import type { FlatGeneratorSettings } from '@jsprismarine/worldgen';

import type { Block } from '../../block/Block';
import type { ServerContent } from '../../content/ServerContent';
import BaseGenerator from '../BaseGenerator';
import type { GeneratorLogger } from '../BaseGenerator';
import Chunk from '../chunk/Chunk';
import { Dimensions, maxSubChunk, maxY, minSubChunk } from '../Dimension';
import type { DimensionType } from '../Dimension';
import type { SurfaceProbe } from '../Generator';
import { bedrockBiomeIdOf } from './datadriven/javaTranslation';

/**
 * The layers a flat world gets when nobody chose any: bedrock, two of dirt, then grass. The
 * same as Java's `minecraft:classic_flat` preset.
 */
export const DEFAULT_FLAT_SETTINGS: FlatGeneratorSettings = {
    layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:dirt', height: 2 },
        { block: 'minecraft:grass_block', height: 1 }
    ],
    biome: 'minecraft:plains',
    lakes: false,
    features: false
};

/** What Java's `FlatLevelSource.getSeaLevel` answers: one above the Overworld's floor, so nothing is under water. */
export const FLAT_SEA_LEVEL = -63;

/** How a {@link FlatGenerator} is built. */
export interface FlatGeneratorOptions {
    /** The layers, bottom up, and the biome. */
    readonly settings: FlatGeneratorSettings;
    /** The dimension the chunks belong to; the first layer sits on its floor. */
    readonly dimension: DimensionType;
    /** The server's loaded content, read when a layer's block is looked up. */
    readonly content: () => ServerContent;
    readonly logger?: GeneratorLogger;
}

/**
 * Java's superflat generator: the settings' layers stacked from the dimension's floor, every
 * block of the chunk in the settings' biome.
 *
 * A layer whose block the content does not know is left as air, so a typo leaves a gap rather
 * than refusing the world. Layers past the dimension's ceiling are dropped, as Java drops them.
 */
export class FlatGenerator extends BaseGenerator {
    /** @inheritDoc */
    public readonly seaLevel = FLAT_SEA_LEVEL;

    private readonly settings: FlatGeneratorSettings;
    private readonly dimension: DimensionType;

    /** The block of every y from the floor up, resolved once; undefined where a layer is unknown. */
    private column: readonly (Block | undefined)[] | undefined;

    public constructor(options: FlatGeneratorOptions) {
        super(options.content, options.logger);
        this.settings = options.settings;
        this.dimension = options.dimension;
    }

    /** @inheritDoc */
    public async generateChunk(cx: number, cz: number): Promise<Chunk> {
        const chunk = new Chunk(cx, cz, undefined, this.dimension);
        const column = this.columnBlocks();
        const floor = this.dimension.minY;

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let place = 0; place < column.length; place++) {
                    const block = column[place];
                    if (block !== undefined) chunk.setBlock(x, floor + place, z, block);
                }
            }
        }

        const biome = bedrockBiomeIdOf(this.settings.biome);
        for (let section = minSubChunk(this.dimension); section <= maxSubChunk(this.dimension); section++) {
            chunk.getBiomes().fillSection(section, biome);
        }

        return chunk;
    }

    /** @inheritDoc */
    public surfaceAt(): SurfaceProbe {
        const column = this.columnBlocks();
        for (let place = column.length - 1; place >= 0; place--) {
            const block = column[place];
            if (block !== undefined) return { y: this.dimension.minY + place, name: block.name };
        }
        return undefined;
    }

    private columnBlocks(): readonly (Block | undefined)[] {
        if (this.column !== undefined) return this.column;

        const room = maxY(this.dimension) - this.dimension.minY + 1;
        const column: (Block | undefined)[] = [];
        for (const layer of this.settings.layers) {
            let block: Block | undefined;
            try {
                block = this.getBlock(layer.block);
            } catch {
                this.getLogger()?.warn(`Flat layer block ${layer.block} is unknown and generates as air`);
            }
            for (let count = 0; count < layer.height && column.length < room; count++) column.push(block);
        }

        this.column = column;
        return column;
    }
}

/**
 * The flat generator as `GeneratorManager` built it: the default layers, the Overworld, no
 * settings read.
 *
 * @deprecated Build through `GeneratorFactories` with a `minecraft:flat` stem; see
 *   `flatStem`. Removed in the next release.
 */
export default class Flat extends FlatGenerator {
    public constructor(contentSource: () => ServerContent, logger?: GeneratorLogger) {
        super({
            settings: DEFAULT_FLAT_SETTINGS,
            dimension: Dimensions.Overworld,
            content: contentSource,
            ...(logger === undefined ? {} : { logger })
        });
    }
}
