import type { PackFormat } from './mcmeta';

/**
 * The Java release a load reads datapacks for.
 *
 * The server loads one Java data set at a time: world generation, loot, recipes and the command
 * tree all come from the same datapack, and a save's chunks carry that release's data version. The
 * target names that release. `pack.mcmeta` ranges and overlays are gated on its `format`, and the
 * mcdoc validator gates `#[since]` and `#[until]` on its `release`.
 *
 * The values come from the `version.json` the Java server jar declares, which `datagen:java`
 * writes beside the generated vanilla datapack.
 */
export interface JavaDataTarget {
    /** The Java release id, such as `26.3` or `26.4-snapshot-8`. */
    readonly release: string;
    /** The data pack format the release reads, as `[major, minor]`. */
    readonly format: PackFormat;
    /** The world data version a save written by the release records. */
    readonly dataVersion: number;
}

/**
 * The target a load uses when it is given none: 26.3, data pack format 121.0, data version 5023.
 *
 * A caller that knows which release it runs passes that release's target instead; this default
 * keeps the loader's behavior for callers written before the target existed.
 */
export const DEFAULT_JAVA_DATA_TARGET: JavaDataTarget = {
    release: '26.3',
    format: [121, 0],
    dataVersion: 5023
};
