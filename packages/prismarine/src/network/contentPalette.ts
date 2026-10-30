/**
 * The guard that stops a content build whose block palette the client will
 * not recognize.
 *
 * `StartGamePacket.BlockNetworkIds Are Hashes` is true on this server, so the
 * number a chunk carries for a block state is the FNV-1a 32 hash of that
 * state's own `{name, states}` compound. Both sides compute it; neither sends
 * a table. The whole scheme therefore rests on the two sides agreeing on
 * which states a block has and what each one is called, and a client told
 * about a block registry that disagrees with its own does not complain. It
 * draws the wrong block.
 *
 * So the disagreement has to be found here, at startup, rather than in a
 * session. Two checks run: `assertBlockPaletteAgrees` from
 * `@jsprismarine/protocol/payload` over the definitions the server is about to declare,
 * and {@link assertContentPaletteAgrees} over the palette behind them, which
 * sees the case the first cannot - a vanilla block whose states the content
 * build changed without declaring anything.
 */
import { vanillaBlockPalette } from '@jsprismarine/blocks';

import type { BlockPalette, BlockStateValue } from '@jsprismarine/blocks';

/** One way the content registry's palette and the client's disagree. */
export interface ContentPaletteDisagreement {
    /** The block identifier the disagreement is about. */
    readonly block: string;
    readonly detail: string;
}

/** Thrown when the server's block palette would desynchronize a client. */
export class ContentPaletteError extends Error {
    public override name = 'ContentPaletteError';

    /** @param disagreements - Every disagreement found, not only the first. */
    public constructor(public readonly disagreements: readonly ContentPaletteDisagreement[]) {
        super(
            `the content block palette disagrees with the client's in ${disagreements.length} place(s), ` +
                `first: ${disagreements[0]?.block} ${disagreements[0]?.detail}`
        );
    }
}

/**
 * Whether two state value lists are the same domain.
 *
 * A flag reads as a boolean on one side and may have been read off a captured
 * byte on the other, so either shape compares as a number.
 */
const sameValues = (left: readonly BlockStateValue[], right: readonly BlockStateValue[]): boolean =>
    left.length === right.length &&
    left.every((value, index) => {
        const other = right[index];
        if (typeof value === 'boolean' || typeof other === 'boolean') return Number(value) === Number(other);
        return value === other;
    });

/**
 * Compares the palette the content build produced with the one a client has.
 *
 * Only `minecraft:` blocks are compared: a pack's own block is one the client
 * learns about from `StartGamePacket.Block Properties`, so its absence from
 * the client palette is the point rather than a fault. For a vanilla block
 * the rule is exact, because the client's palette is fixed and the server
 * cannot change it.
 *
 * @param palette - The palette the content build resolved, which is
 *   `ServerContent.blocks.palette`.
 * @param client - The palette a client has, the captured vanilla one by default.
 * @throws {ContentPaletteError} When any vanilla block is missing from either
 *   side or carries states the other does not.
 */
export const assertContentPaletteAgrees = (
    palette: BlockPalette,
    client: BlockPalette = vanillaBlockPalette()
): void => {
    const disagreements: ContentPaletteDisagreement[] = [];

    for (const entry of palette.entries) {
        if (!entry.identifier.startsWith('minecraft:')) continue;

        const theirs = client.entry(entry.identifier);
        if (theirs === undefined) {
            disagreements.push({
                block: entry.identifier,
                detail: 'is in the vanilla namespace but is not a block the client has'
            });
            continue;
        }

        for (const state of entry.model.states) {
            const other = theirs.model.state(state.name);
            if (other === undefined) {
                disagreements.push({
                    block: entry.identifier,
                    detail: `carries the state ${state.name}, which the client's block does not`
                });
                continue;
            }
            if (!sameValues(state.values, other.values)) {
                disagreements.push({
                    block: entry.identifier,
                    detail: `carries ${state.name} as ${JSON.stringify(state.values)}, the client has ${JSON.stringify(other.values)}`
                });
            }
        }

        for (const state of theirs.model.states) {
            if (entry.model.state(state.name) === undefined) {
                disagreements.push({
                    block: entry.identifier,
                    detail: `is missing the state ${state.name}, which the client's block has`
                });
            }
        }
    }

    for (const entry of client.entries) {
        if (palette.entry(entry.identifier) === undefined) {
            disagreements.push({
                block: entry.identifier,
                detail: 'is a block the client has and the content build does not'
            });
        }
    }

    if (disagreements.length > 0) throw new ContentPaletteError(disagreements);
};
