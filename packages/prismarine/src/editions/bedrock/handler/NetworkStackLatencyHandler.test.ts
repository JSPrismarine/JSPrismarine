import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type ClientConnection from '../../../network/ClientConnection';
import { sessionContext } from '../../../testing/handlerContext.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import { STEVE } from '../../../testing/sessionIdentity.test.helper';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import NetworkStackLatencyPacket from '@jsprismarine/protocol/bedrock/packet/NetworkStackLatencyPacket';
import type PlayerSession from '../../../player/PlayerSession';
import NetworkStackLatencyHandler from './NetworkStackLatencyHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const sent: NetworkPacket[] = [];
    let answers = 0;
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => void sent.push(packet),
        keepAliveAnswered: () => void answers++
    });

    return {
        logged,
        sent,
        answers: () => answers,
        context: sessionContext(stub<PlayerSession>({ identity: STEVE, getConnection: () => connection }), {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        })
    };
};

describe('NetworkStackLatencyHandler', () => {
    it("takes a ping that asks for nothing as the answer to the server's keep-alive, and sends nothing back", async () => {
        const { logged, sent, answers, context } = fakeSession();
        const packet = Object.assign(new NetworkStackLatencyPacket(), { creationTime: 42n, isFromServer: false });

        await new NetworkStackLatencyHandler().handle(packet, context);

        expect(sent).toEqual([]);
        expect(answers()).toBe(1);
        expect(logged).toEqual(['Steve pinged at 42']);
    });

    it('echoes the timestamp when the ping asks for an answer, with the flag cleared', async () => {
        const { sent, context } = fakeSession();
        const packet = Object.assign(new NetworkStackLatencyPacket(), { creationTime: 42n, isFromServer: true });

        await new NetworkStackLatencyHandler().handle(packet, context);

        expect(sent).toHaveLength(1);
        const answer = sent[0];
        expect(answer).toBeInstanceOf(NetworkStackLatencyPacket);
        if (!(answer instanceof NetworkStackLatencyPacket)) return;
        expect(answer.creationTime).toBe(42n);
        expect(answer.isFromServer).toBe(false);
    });

    it("takes a ping with the flag set as the answer to the server's keep-alive too, as a game client sends it", async () => {
        const { answers, context } = fakeSession();
        const packet = Object.assign(new NetworkStackLatencyPacket(), {
            creationTime: 42_000_000n,
            isFromServer: true
        });

        await new NetworkStackLatencyHandler().handle(packet, context);

        expect(answers()).toBe(1);
    });
});
