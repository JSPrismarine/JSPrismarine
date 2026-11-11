import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type ClientConnection from '../ClientConnection';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import NetworkStackLatencyPacket from '@jsprismarine/protocol/packet/NetworkStackLatencyPacket';
import type PlayerSession from '../PlayerSession';
import NetworkStackLatencyHandler from './NetworkStackLatencyHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const sent: NetworkPacket[] = [];
    const connection = stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) });

    return {
        logged,
        sent,
        context: sessionContext(stub<PlayerSession>({ identity: STEVE, getConnection: () => connection }), {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        })
    };
};

describe('NetworkStackLatencyHandler', () => {
    it('logs a ping that asks for nothing and sends nothing back', async () => {
        const { logged, sent, context } = fakeSession();
        const packet = Object.assign(new NetworkStackLatencyPacket(), { creationTime: 42n, isFromServer: false });

        await new NetworkStackLatencyHandler().handle(packet, context);

        expect(sent).toEqual([]);
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
});
