import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type PlayerSession from '../../player/PlayerSession';
import type { BedrockChunkWire } from './BedrockChunkWire';
import { BedrockPresenter } from './presenter/BedrockPresenter';

/**
 * The chunk wire of a Bedrock session, for the handlers of the packets only a Bedrock client
 * sends about its chunks: sub chunk requests and the blob cache.
 * @param session - The session the packet came in on.
 */
export const bedrockChunksOf = (session: PlayerSession): BedrockChunkWire => {
    const { presenter } = session;
    if (!(presenter instanceof BedrockPresenter)) throw new PrismarineNetworkErrors.NotABedrockSession();
    return presenter.chunkWire;
};
