/**
 * The one adapter between the two random interfaces the generation stack carries.
 *
 * The decoration pass draws through `@jsprismarine/features`' `WorldgenRandom`, which declares
 * `@jsprismarine/worldgen`'s interface, and a structure piece draws through
 * `@jsprismarine/structures`' narrower one. Java hands the same stream to both, so the two meet
 * here and every draw passes straight through.
 */
import type { RandomSource as StructureRandom } from '@jsprismarine/structures';
import type { RandomSource as WorldgenRandomSource } from '@jsprismarine/worldgen';

/** Presents a decoration stream as the interface a structure piece draws from. */
export const asStructureRandom = (random: WorldgenRandomSource): StructureRandom => ({
    nextInt: (bound) => (bound === undefined ? random.nextInt() : random.nextIntBounded(bound)),
    nextFloat: () => random.nextFloat(),
    nextDouble: () => random.nextDouble(),
    nextLong: () => random.nextLong(),
    nextBoolean: () => random.nextBoolean(),
    fork: () => asStructureRandom(random.fork())
});
