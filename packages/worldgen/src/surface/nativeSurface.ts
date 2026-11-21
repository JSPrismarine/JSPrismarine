import { NativeSurfaceCondition, NativeSurfaceLayout } from '@jsprismarine/native-worldgen';
import type { NativeDensityProgram, NativeSurface } from '@jsprismarine/native-worldgen';

import { isBarrenVeinCell, ORE_VEIN_SEED } from '../chunk/oreVein';
import type { OreVeinCellBound } from '../chunk/oreVein';
import { AIR, LAVA, WATER } from '../chunk/FluidPicker';
import type { SampleContext } from '../density/SampleContext';
import { floorDiv } from '../math';
import { NativeStackNoise } from '../noise/nativeNoise';
import { LegacyPositionalRandomFactory } from '../random/LegacyRandomSource';
import { XoroshiroPositionalRandomFactory } from '../random/XoroshiroRandomSource';
import type { RandomState } from '../RandomState';
import type { MaterialRuleProgram } from './MaterialRuleProgram';
import type { WorldGenerationContext } from './VerticalAnchor';
import { resolveAnchorY } from './VerticalAnchor';

/** The column categories the C walk reads. */
const CATEGORY_AIR = 0;
const CATEGORY_FLUID = 1;
const CATEGORY_SOLID = 2;

/** A vein the C places, and the bound its cell verdicts come from. */
interface VeinSetup {
    readonly cellBound: OreVeinCellBound | undefined;
}

/** One chunk's surface results: each block's state index, unchanged or fallback, and the fallbacks. */
export interface NativeSurfaceResult {
    /** One entry a block, column by column (x-major) from min y up. */
    readonly states: Int32Array;
    /** The state each index names. */
    readonly names: readonly string[];
    /** {@link NativeSurfaceLayout.fallbackFields} values per fallback block. */
    readonly fallbacks: Int32Array;
    readonly fallbackCount: number;
}

/**
 * A material rule program laid out for the native surface pass of one dimension and seed.
 *
 * The C answers every condition but `temperature`, a noise that runs in TypeScript, and the
 * `bandlands` rule; a block that reaches one comes back for {@link MaterialRuleInterpreter}.
 */
export class NativeSurfacePass {
    private readonly frame = new Int32Array(NativeSurfaceLayout.frameFields);
    private columns: Float64Array | undefined;
    private blocks: Uint8Array | undefined;
    private states: Int32Array | undefined;
    private fallbacks: Int32Array | undefined;
    private biomes = new Int32Array(0);
    private verdicts = new Uint8Array(0);

    private constructor(
        private readonly surface: NativeSurface,
        /** The state each result index names: the program's states, then each vein's three. */
        private readonly names: readonly string[],
        /** An id for each biome a `biome` condition names; any other biome is {@link otherBiome}. */
        private readonly biomeIds: ReadonlyMap<string, number>,
        private readonly otherBiome: number,
        private readonly veins: readonly VeinSetup[],
        /** The cell the vein verdicts are counted in, when any vein has a bound. */
        private readonly verdictCell: { readonly xz: number; readonly y: number } | undefined
    ) {}

    /**
     * Lays a program out for the C, or answers undefined where it cannot run there: the library
     * does not load, a vein's tree has no native program, or a random is not Xoroshiro's.
     */
    public static create(
        program: MaterialRuleProgram,
        randomState: RandomState,
        generationContext: WorldGenerationContext,
        zoomSeed: bigint
    ): NativeSurfacePass | undefined {
        const library = randomState.native;
        if (library === undefined) return undefined;

        const biomeIds = new Map<string, number>();
        for (const condition of program.conditions) {
            if (condition.type !== 'biome') continue;
            for (const biome of condition.biomes) if (!biomeIds.has(biome)) biomeIds.set(biome, biomeIds.size);
        }
        const otherBiome = biomeIds.size;
        const biomeWords = Math.ceil((otherBiome + 1) / 32);

        const conditionDoubles = NativeSurfaceLayout.conditionDoubles;
        const conditions = new Float64Array(program.conditions.length * conditionDoubles);
        const biomeSets: number[] = [];
        program.conditions.forEach((condition, index) => {
            const record = conditions.subarray(index * conditionDoubles, (index + 1) * conditionDoubles);
            record[0] = NativeSurfaceCondition.unanswered;
            switch (condition.type) {
                case 'biome': {
                    const set = new Array<number>(biomeWords).fill(0);
                    for (const biome of condition.biomes) {
                        const id = biomeIds.get(biome)!;
                        set[id >> 5] = (set[id >> 5]! | (1 << (id & 31))) >>> 0;
                    }
                    record[0] = NativeSurfaceCondition.biome;
                    record[1] = biomeSets.length;
                    biomeSets.push(...set);
                    break;
                }
                case 'noise_threshold': {
                    const noise = randomState.noise(condition.noise);
                    if (!(noise instanceof NativeStackNoise)) break;
                    record[0] = NativeSurfaceCondition.noise;
                    record[1] = noise.native.nativeHandle;
                    record[2] = condition.minThreshold;
                    record[3] = condition.maxThreshold;
                    record[4] = condition.is3d ? 1 : 0;
                    record[NativeSurfaceLayout.conditionPerColumn] = condition.is3d ? 0 : 1;
                    break;
                }
                case 'vertical_gradient': {
                    const random = randomState.randomFactory(condition.randomName);
                    if (random instanceof XoroshiroPositionalRandomFactory) {
                        record[0] = NativeSurfaceCondition.verticalGradient;
                    } else if (random instanceof LegacyPositionalRandomFactory) {
                        record[0] = NativeSurfaceCondition.verticalGradientLegacy;
                    } else {
                        break;
                    }
                    record[1] = resolveAnchorY(condition.trueAtAndBelow, generationContext);
                    record[2] = resolveAnchorY(condition.falseAtAndAbove, generationContext);
                    record.set(random.seedLanes, 3);
                    break;
                }
                case 'y_above':
                    record[0] = NativeSurfaceCondition.yAbove;
                    record[1] = resolveAnchorY(condition.anchor, generationContext);
                    record[2] = condition.surfaceDepthMultiplier;
                    record[3] = condition.addStoneDepth ? 1 : 0;
                    break;
                case 'water':
                    record[0] = NativeSurfaceCondition.water;
                    record[1] = condition.offset;
                    record[2] = condition.surfaceDepthMultiplier;
                    record[3] = condition.addStoneDepth ? 1 : 0;
                    break;
                case 'steep':
                    record[0] = NativeSurfaceCondition.steep;
                    record[NativeSurfaceLayout.conditionPerColumn] = 1;
                    break;
                case 'hole':
                    record[0] = NativeSurfaceCondition.hole;
                    record[NativeSurfaceLayout.conditionPerColumn] = 1;
                    break;
                case 'above_preliminary_surface':
                    record[0] = NativeSurfaceCondition.abovePreliminarySurface;
                    break;
                case 'stone_depth':
                    record[0] = NativeSurfaceCondition.stoneDepth;
                    record[1] = condition.offset;
                    record[2] = condition.addSurfaceDepth ? 1 : 0;
                    record[3] = condition.secondaryDepthRange;
                    record[4] = condition.surfaceType === 'ceiling' ? 1 : 0;
                    break;
                case 'temperature':
                    break;
            }
        });

        const names = [...program.states];
        const veinRandom = randomState.randomFactory(ORE_VEIN_SEED);
        const veinLanes = veinRandom instanceof XoroshiroPositionalRandomFactory ? veinRandom.seedLanes : undefined;
        if (program.oreVeins.length > 0 && veinLanes === undefined) return undefined;
        const veinDoubles = NativeSurfaceLayout.veinDoubles;
        const veins = new Float64Array(program.oreVeins.length * veinDoubles);
        const programs: NativeDensityProgram[] = [];
        const veinSetups: VeinSetup[] = [];
        let verdictCell: { xz: number; y: number } | undefined;
        for (let index = 0; index < program.oreVeins.length; index++) {
            const rule = program.oreVeins[index]!;
            const density = randomState.nativeProgram(rule.density);
            const richness = randomState.nativeProgram(rule.richness);
            const gap = randomState.nativeProgram(rule.fillerGap);
            if (density === undefined || richness === undefined || gap === undefined) return undefined;
            programs.push(density, richness, gap);
            const cell = randomState.interpolationCellSizeOf(rule.density);
            const cellBound =
                cell === undefined ? undefined : { density: randomState.boundSampler(rule.density), cell };
            verdictCell ??= cellBound?.cell;
            // Verdicts share one cell layout; a vein whose cell differs samples every block.
            const hasVerdicts =
                cellBound !== undefined && cellBound.cell.xz === verdictCell?.xz && cellBound.cell.y === verdictCell.y;
            veinSetups.push({ cellBound: hasVerdicts ? cellBound : undefined });
            const record = veins.subarray(index * veinDoubles, (index + 1) * veinDoubles);
            record[0] = density.nativeHandle;
            record[1] = richness.nativeHandle;
            record[2] = gap.nativeHandle;
            record[3] = rule.rawOreChance;
            record[4] = names.push(rule.oreBlock) - 1;
            record[5] = names.push(rule.rawOreBlock) - 1;
            record[6] = names.push(rule.fillerBlock) - 1;
            record.set(veinLanes!, 7);
            record[11] = hasVerdicts ? 1 : 0;
        }

        const unsignedSeed = BigInt.asUintN(64, zoomSeed);
        const surface = library.createSurface({
            ops: program.ops,
            conditions,
            biomeSets: Uint32Array.from(biomeSets),
            biomeWords,
            veins,
            programs,
            stateCount: names.length,
            zoomSeed: [Number(unsignedSeed >> 32n), Number(unsignedSeed & 0xffffffffn)]
        });
        return new NativeSurfacePass(surface, names, biomeIds, otherBiome, veinSetups, verdictCell);
    }

    /** The column record of one column, which the caller fills before {@link run}. */
    public columnRecords(): Float64Array {
        return (this.columns ??= new Float64Array(256 * NativeSurfaceLayout.columnFields));
    }

    /** The category buffer of a chunk `height` blocks tall, which the caller fills before {@link run}. */
    public blockCategories(height: number): Uint8Array {
        if (this.blocks === undefined || this.blocks.length !== 256 * height)
            this.blocks = new Uint8Array(256 * height);
        return this.blocks;
    }

    /** The category of one block state, as the C walk reads it. */
    public static categoryOf(state: string): number {
        return state === AIR ? CATEGORY_AIR : state === WATER || state === LAVA ? CATEGORY_FLUID : CATEGORY_SOLID;
    }

    /**
     * Runs the pass over one chunk whose column records and categories are filled.
     * @param topY - The highest starting height of any column, above which no block is run.
     * @param biomeCellAt - The unjittered biome of a cell, which the C's jittered lookup picks among.
     */
    public run(
        chunkX: number,
        chunkZ: number,
        minY: number,
        height: number,
        topY: number,
        biomeCellAt: (quartX: number, quartY: number, quartZ: number) => string,
        sampleContext: SampleContext
    ): NativeSurfaceResult {
        const frame = this.frame;
        frame[0] = chunkX;
        frame[1] = chunkZ;
        frame[2] = minY;
        frame[3] = height;

        // Every cell a block's lookup can pick: the parent cells of x and z shifted by two, one more
        // each. The walk runs no block above a column's starting height, so neither do the cells.
        const maxY = minY + height - 1;
        const quartX = (chunkX * 16 - 2) >> 2;
        const quartY = (minY - 2) >> 2;
        const quartZ = (chunkZ * 16 - 2) >> 2;
        const sizeXz = ((chunkX * 16 + 13) >> 2) + 1 - quartX + 1;
        const sizeY = ((Math.max(minY, Math.min(maxY, topY)) - 2) >> 2) + 1 - quartY + 1;
        frame[4] = quartX;
        frame[5] = quartY;
        frame[6] = quartZ;
        frame[7] = sizeXz;
        frame[8] = sizeY;
        frame[9] = sizeXz;
        const biomeCount = sizeXz * sizeXz * sizeY;
        if (this.biomes.length < biomeCount) this.biomes = new Int32Array(biomeCount);
        const biomes = this.biomes;
        let index = 0;
        for (let x = 0; x < sizeXz; x++) {
            for (let z = 0; z < sizeXz; z++) {
                for (let y = 0; y < sizeY; y++) {
                    const biome = biomeCellAt(quartX + x, quartY + y, quartZ + z);
                    biomes[index++] = this.biomeIds.get(biome) ?? this.otherBiome;
                }
            }
        }

        const cell = this.verdictCell;
        if (cell !== undefined) {
            const cellX = floorDiv(chunkX * 16, cell.xz);
            const cellY = floorDiv(minY, cell.y);
            const cellZ = floorDiv(chunkZ * 16, cell.xz);
            const cellsXz = floorDiv(chunkX * 16 + 15, cell.xz) - cellX + 1;
            const cellsY = floorDiv(maxY, cell.y) - cellY + 1;
            frame[10] = cellX;
            frame[11] = cellY;
            frame[12] = cellZ;
            frame[13] = cellsXz;
            frame[14] = cellsY;
            frame[15] = cellsXz;
            frame[16] = cell.xz;
            frame[17] = cell.y;
            const cells = cellsXz * cellsXz * cellsY;
            if (this.verdicts.length < cells * this.veins.length)
                this.verdicts = new Uint8Array(cells * this.veins.length);
            const verdicts = this.verdicts;
            this.veins.forEach((vein, veinIndex) => {
                const bound = vein.cellBound;
                if (bound === undefined) return;
                let at = veinIndex * cells;
                for (let x = 0; x < cellsXz; x++) {
                    for (let z = 0; z < cellsXz; z++) {
                        for (let y = 0; y < cellsY; y++) {
                            verdicts[at++] = isBarrenVeinCell(bound, sampleContext, cellX + x, cellY + y, cellZ + z)
                                ? NativeSurfaceLayout.barren
                                : 0;
                        }
                    }
                }
            });
        }

        const blockCount = 256 * height;
        if (this.states === undefined || this.states.length !== blockCount) {
            this.states = new Int32Array(blockCount);
            this.fallbacks = new Int32Array(blockCount * NativeSurfaceLayout.fallbackFields);
        }
        const fallbackCount = this.surface.chunk(
            frame,
            this.columnRecords(),
            this.blockCategories(height),
            biomes,
            this.verdicts,
            this.states,
            this.fallbacks!
        );
        return { states: this.states, names: this.names, fallbacks: this.fallbacks!, fallbackCount };
    }
}
