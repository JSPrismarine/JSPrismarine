import { Logger } from '@jsprismarine/logger';
import { CreditsState, NetworkBinaryStream, PacketIdentifier } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import Credits, { ShowCreditsPacket } from './Credits';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import { FakeTransport } from './testing/fakeTransport.test.helper';

import type { ShowCreditsPayload } from '@jsprismarine/protocol';

const RUNTIME_ID = 7n;

const newCredits = () => {
    const transport = new FakeTransport();
    const registry = new ClientPacketRegistry();
    registry.register(ShowCreditsPacket);
    const session = new ClientSession(transport, registry, new Logger('error'));
    const credits = new Credits(session, () => RUNTIME_ID);
    const events: { name: string; credits: ShowCreditsPayload }[] = [];
    for (const name of ['start', 'finished']) {
        credits.on(name, (payload: ShowCreditsPayload) => events.push({ name, credits: payload }));
    }
    return { transport, session, events };
};

describe('Credits', () => {
    it('answers the start of the credits with one Finished under its runtime id', async () => {
        const { transport, session, events } = newCredits();
        const start = { playerRuntimeId: RUNTIME_ID, creditsState: CreditsState.Start };

        await transport.deliver(new ShowCreditsPacket(start));
        await session.settled();

        const sent = await transport.sentPackets();
        expect(sent.map((packet) => ClientPacketRegistry.readPacketId(packet))).toEqual([
            PacketIdentifier.SHOW_CREDITS
        ]);
        expect(new ShowCreditsPacket().deserialize(new NetworkBinaryStream(sent[0]!))).toEqual({
            playerRuntimeId: RUNTIME_ID,
            creditsState: CreditsState.Finished
        });
        expect(events).toEqual([
            { name: 'start', credits: start },
            { name: 'finished', credits: start }
        ]);
    });

    it('answers in the login phase as well as in play', async () => {
        const { transport, session } = newCredits();

        await transport.deliver(
            new ShowCreditsPacket({ playerRuntimeId: RUNTIME_ID, creditsState: CreditsState.Start })
        );
        await session.settled();
        session.setPhase('play');
        await transport.deliver(
            new ShowCreditsPacket({ playerRuntimeId: RUNTIME_ID, creditsState: CreditsState.Start })
        );
        await session.settled();

        expect(await transport.sentPackets()).toHaveLength(2);
    });

    it('leaves a credits packet that is not the start unanswered', async () => {
        const { transport, session, events } = newCredits();

        await transport.deliver(
            new ShowCreditsPacket({ playerRuntimeId: RUNTIME_ID, creditsState: CreditsState.Finished })
        );
        await session.settled();

        expect(transport.sent).toEqual([]);
        expect(events).toEqual([]);
    });
});
