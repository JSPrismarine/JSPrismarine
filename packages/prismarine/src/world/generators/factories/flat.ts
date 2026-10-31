import type { FlatGeneratorSettings, LevelStem } from '@jsprismarine/worldgen';
import { parseFlatGeneratorSettings } from '@jsprismarine/worldgen';

import type { Block } from '../../../block/Block';
import type { ServerContent } from '../../../content/ServerContent';
import BaseGenerator from '../../BaseGenerator';
import type { GeneratorLogger } from '../../BaseGenerator';
import Chunk from '../../chunk/Chunk';
import { maxSubChunk, maxY, minSubChunk } from '../../Dimension';
import type { DimensionType } from '../../Dimension';
import type { SurfaceProbe } from '../../Generator';
import type { GeneratorFactory } from '../../GeneratorFactories';
import { bedrockBiomeIdOf } from '../datadriven/javaTranslation';
import type { JavaWorldgenRegistries } from '../datadriven/javaWorldgenData';

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

/** The kind id of Java's superflat generator. */
export const FLAT_GENERATOR_KIND = 'minecraft:flat';

/**
 * A flat stem for a dimension type.
 *
 * @param settings - The layers and biome, or the `worldgen/flat_level_generator_preset` id that
 *   carries them. Defaults to {@link DEFAULT_FLAT_SETTINGS}.
 */
export const flatStem = (
    dimensionType: string,
    settings: FlatGeneratorSettings | string = DEFAULT_FLAT_SETTINGS
): LevelStem => ({
    type: dimensionType,
    generator: { type: FLAT_GENERATOR_KIND, settings }
});

/**
 * The `minecraft:flat` kind: the stem's layers stacked from the dimension's floor, in the
 * stem's biome.
 *
 * The stem's `settings` is the settings object or a `worldgen/flat_level_generator_preset` id,
 * which Java's `world_gen_settings` allows in its place. The id resolves through the pack
 * stack's preset registry, so a datapack's preset works as well as the vanilla nine; that is
 * the one case in which this kind reads the Java registries.
 *
 * `lakes`, `features` and `structure_overrides` are read and kept but not yet honored: no
 * feature or structure runs over a flat chunk today.
 *
 * @throws {Error} When the stem names a preset no `worldgen/flat_level_generator_preset`
 *   document defines, or the preset's `settings` do not parse.
 */
export const flatGeneratorFactory: GeneratorFactory = {
    kind: FLAT_GENERATOR_KIND,
    build(context) {
        const generator = context.stem.generator;
        // The stem parser only produces settings for this kind, so a stem of another kind
        // reaching this factory is a registry bug rather than a data error.
        if (generator.type !== FLAT_GENERATOR_KIND || !('settings' in generator)) {
            throw new TypeError(`The ${context.dimension.id} stem carries no flat generator settings`);
        }
        const settings =
            typeof generator.settings === 'string'
                ? presetSettings(context.worldgen(), context.dimension.id, generator.settings)
                : generator.settings;
        if (!isFlatSettings(settings)) {
            throw new TypeError(`The ${context.dimension.id} stem carries no flat generator settings`);
        }

        return new FlatGenerator({
            settings,
            dimension: context.dimension,
            content: context.content,
            logger: context.logger
        });
    }
};

/**
 * The settings of a `worldgen/flat_level_generator_preset`, which the datapack wraps under a
 * `settings` key beside the `display` item the preset picker shows.
 *
 * @throws {Error} When no document has the id, or its `settings` do not parse.
 */
const presetSettings = (
    registries: JavaWorldgenRegistries,
    dimensionType: string,
    preset: string
): FlatGeneratorSettings => {
    const document = registries.flatLevelGeneratorPresets.get(preset);
    if (document === undefined) {
        throw new Error(
            `The ${dimensionType} stem names the flat preset ${preset}, which no worldgen/flat_level_generator_preset document defines`
        );
    }
    const path = `worldgen/flat_level_generator_preset/${preset}`;
    const settings =
        typeof document === 'object' && document !== null && 'settings' in document ? document.settings : undefined;
    return parseFlatGeneratorSettings(settings, `${path}.settings`);
};

const isFlatSettings = (value: unknown): value is FlatGeneratorSettings =>
    typeof value === 'object' && value !== null && 'layers' in value && Array.isArray(value.layers);
