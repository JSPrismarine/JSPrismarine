/**
 * The subsystems that still have to supply part of the world adapter.
 *
 * A member named here is declared but not implemented yet. Calling it throws
 * {@link NotWiredError} instead of returning a value the caller would have no
 * way to tell apart from a real one, which is the failure mode this whole
 * file exists to prevent: a spawn rule that reads light level 0 everywhere
 * looks like a dark world rather than like missing code.
 */
export const CONTENT_AREAS = {
    /** `src/block/` and `src/item/`: block state reads and writes, and the item behavior world. */
    blocksAndItems: 'blocks and items',
    /** `src/world/`: chunks, the dimension bounds, the world clock and feature placement. */
    world: 'world',
    /** `src/entity/`: entity queries, spawning, goals and brains. */
    entities: 'entities',
    /** `src/network/`: the wire payloads and the command host. */
    network: 'network'
} as const;

/** One of {@link CONTENT_AREAS}. */
export type ContentArea = (typeof CONTENT_AREAS)[keyof typeof CONTENT_AREAS];

/** Thrown by a world adapter member whose owning subsystem has not supplied it yet. */
export class NotWiredError extends Error {
    public override name = 'NotWiredError';

    /**
     * @param member - The adapter member that was called, such as `blocks.get`.
     * @param area - Which subsystem owns the missing implementation.
     */
    public constructor(
        public readonly member: string,
        public readonly area: ContentArea
    ) {
        super(`${member} is not wired yet; the ${area} subsystem owns it`);
    }
}

/**
 * Builds the body of an adapter member nothing implements yet.
 *
 * Written as a factory rather than a bare throw so the member keeps the
 * return type its interface declares and the compiler still checks every
 * other member of the object around it.
 *
 * @param member - The adapter member, such as `blocks.get`.
 * @param area - Which subsystem owes the implementation.
 * @returns A function that throws {@link NotWiredError} whatever it is passed.
 */
export const notWired =
    (member: string, area: ContentArea) =>
    (..._arguments: readonly unknown[]): never => {
        throw new NotWiredError(member, area);
    };
