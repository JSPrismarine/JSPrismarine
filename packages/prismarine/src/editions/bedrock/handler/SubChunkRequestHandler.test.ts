import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../../testing/handlerContext.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import { STEVE } from '../../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../../../player/PlayerSession';
import SubChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/SubChunkRequestPacket';
import SubChunkRequestHandler from './SubChunkRequestHandler';
import type { BedrockChunkWire } from '../BedrockChunkWire';
import { BedrockPresenter } from '../presenter/BedrockPresenter';

describe('SubChunkRequestHandler', () => {
    it('answers and logs the request', async () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({
            identity: STEVE,
            presenter: new BedrockPresenter({ sendDataPacket: async () => {} }, undefined, {
                runtimeId: 0n,
                lastInputTick: () => 0n,
                chunks: stub<BedrockChunkWire>({
                    answerSubChunkRequest: async () => 1
                })
            })
        });
        const packet = Object.assign(new SubChunkRequestPacket(), {
            dimensionType: 0,
            offsets: [{ x: 0, y: 1, z: 0 }],
            centerPos: { x: 2, y: 3, z: 4 }
        });

        await new SubChunkRequestHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual(['Steve requested 1 sub chunk(s) around 2, 3, 4 in dimension 0; answered 1']);
    });
});
