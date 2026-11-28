/**
 * The content a Bedrock client is sent once, in the join burst: the creative menu and the
 * recipes. Neither has a Java counterpart sent this way, so they live with the burst rather than
 * in the session.
 */
import { CraftingDataPacket, CreativeContentPacket } from '@jsprismarine/protocol';

import type { Logger } from '@jsprismarine/logger';

import type { ServerContent } from '../../content/ServerContent';
import { showRecipeBook } from '../../crafting/recipeBook';
import type { CreativeInventory } from '../../inventory/CreativeInventory';
import type PlayerSession from '../../player/PlayerSession';
import type { NetworkContentPayloads } from './contentPayloads';
import { craftingRecipeCount, limitCraftingData } from './contentPayloads';
import { sendCachedJoinPacket } from './joinPacketCache';
import { creativeContentFrom } from './payloadAdapters';

/** What the join burst already holds that the menu and the recipes are built from. */
export interface JoinContent {
    readonly content: ServerContent;
    /** The content's payloads for the session's protocol, or undefined when none were built. */
    readonly payloads: NetworkContentPayloads | undefined;
    /** `crafting-recipe-limit`. */
    readonly recipeLimit: number;
    readonly compressionLevel: number;
    /** The captured catalog, which the menu falls back to when no payloads were built. */
    readonly creativeInventory: () => Pick<CreativeInventory, 'getGroups' | 'getEntries'>;
    readonly log: Pick<Logger, 'debug'>;
}

/**
 * Tells the client which recipes exist.
 *
 * Until it has these the client proposes nothing and never sends a `CRAFTING_RECIPE`, so
 * everything below this - the matcher, the stations, the grid - is invisible without it.
 *
 * The recipes come from the content build's recipe book, and a recipe's net id is its
 * position in that book, which is what an `ItemStackRequest` names it by. A build that
 * produced no payload sends nothing, so the client proposes nothing it cannot craft.
 *
 * How many go out is `crafting-recipe-limit` in the config: `0` sends nothing, `-1`
 * sends everything, and it starts at one. See there for why.
 * @param session - The joining session.
 * @param join - What the join burst holds.
 */
export const sendCraftingData = async (
    session: PlayerSession,
    { content, payloads, recipeLimit: limit, compressionLevel, log }: JoinContent
): Promise<void> => {
    const connection = session.getConnection();
    if (limit === 0) return;

    if (payloads === undefined || craftingRecipeCount(payloads.crafting) === 0) return;

    const all = craftingRecipeCount(payloads.crafting);
    const crafting = limit < 0 ? payloads.crafting : limitCraftingData(payloads.crafting, limit);

    await sendCachedJoinPacket(connection, content, limit, compressionLevel, new CraftingDataPacket(crafting));

    const sent = craftingRecipeCount(crafting);
    log.debug(`Sent §b${sent}§r of §b${all}§r recipe(s) to ${session.identity.name}`);

    // After the recipes, so every entry the book names is one the client has.
    await showRecipeBook(session.keyed());
};

/**
 * Sends the creative menu: the content build's, or the captured catalog when no content was
 * built.
 * @param session - The joining session.
 * @param join - What the join burst holds.
 */
export const sendCreativeContents = async (
    session: PlayerSession,
    { content, payloads, recipeLimit, compressionLevel, creativeInventory }: JoinContent
): Promise<void> => {
    const connection = session.getConnection();
    // The same list a creative pick is resolved through, so that the position the client
    // sends back names the entry it was shown. `creativePick` reads the same two sources
    // in the same order.
    if (payloads === undefined) {
        const creative = creativeInventory();
        await connection.sendDataPacket(
            new CreativeContentPacket(creativeContentFrom(creative.getGroups(), creative.getEntries()))
        );
        return;
    }

    await sendCachedJoinPacket(
        connection,
        content,
        recipeLimit,
        compressionLevel,
        new CreativeContentPacket(payloads.creative)
    );
};
