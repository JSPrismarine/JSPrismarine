import type { NoiseGeneratorSettings } from '../settings/NoiseGeneratorSettings';

/** The Java block state identifier for air, which this package treats as "no block". */
export const AIR = 'minecraft:air';

/** The Java block state identifier for lava, which the deep fluid level uses. */
export const LAVA = 'minecraft:lava';

/** The Java block state identifier for water, which aquifers compare against. */
export const WATER = 'minecraft:water';

/** The y level below which the global picker switches from the sea fluid to lava. */
export const LAVA_LEVEL = -54;

/** A fluid surface: everything strictly below `fluidLevel` is `fluidType`, above it is air. */
export class FluidStatus {
    public constructor(
        /** The y level the fluid fills up to, exclusive. */
        public readonly fluidLevel: number,
        /** The Java block state identifier of the fluid. */
        public readonly fluidType: string
    ) {}

    /** Returns the block that fills one y level: the fluid below the level, air at or above. */
    public at(blockY: number): string {
        return blockY < this.fluidLevel ? this.fluidType : AIR;
    }

    /** Whether two statuses describe the same fluid at the same level. */
    public equals(other: FluidStatus): boolean {
        return this.fluidLevel === other.fluidLevel && this.fluidType === other.fluidType;
    }
}

/** Chooses the fluid a position would hold if no aquifer overrode it. */
export type FluidPicker = (x: number, y: number, z: number) => FluidStatus;

/**
 * Builds the dimension-wide fluid picker: the settings' fluid up to sea level, and lava below
 * y -54.
 *
 * Aquifers start from this and then decide, cell by cell, whether to raise, lower or remove
 * the fluid surface.
 */
export const createGlobalFluidPicker = (settings: NoiseGeneratorSettings): FluidPicker => {
    const lavaStatus = new FluidStatus(LAVA_LEVEL, LAVA);
    const seaStatus = new FluidStatus(settings.seaLevel, settings.defaultFluid);
    const threshold = Math.min(LAVA_LEVEL, settings.seaLevel);
    return (_x, y) => (y < threshold ? lavaStatus : seaStatus);
};
