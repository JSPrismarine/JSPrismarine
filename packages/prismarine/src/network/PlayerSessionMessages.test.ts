import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type DataPacket from './packet/DataPacket';
import TextPacket from './packet/TextPacket';
import PlayerSession from './PlayerSession';
import TextPacketType from './type/TextPacketType';

/** A session whose connection records what goes out. */
const sessionWithRecorder = () => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => void sent.push(packet)
    });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player: stub<Player>()
    });

    return { session, sent };
};

describe('network', () => {
    describe('PlayerSession', () => {
        describe('sendMessage', () => {
            it('sends the message with an empty filtered message', async () => {
                // `Filtered Message` is the text after chat filtering, and a dedicated server
                // sends it empty for its own messages. Repeating the message there doubled
                // the payload and told the client the text had been through a filter.
                const { session, sent } = sessionWithRecorder();

                await session.sendMessage({ message: 'hello', sourceName: 'Server', type: TextPacketType.Chat });

                expect(sent).toHaveLength(1);
                const [packet] = sent;
                expect(packet).toBeInstanceOf(TextPacket);
                if (!(packet instanceof TextPacket)) return;

                expect(packet.type).toBe(TextPacketType.Chat);
                expect(packet.message).toBe('hello');
                expect(packet.sourceName).toBe('Server');
                expect(packet.filtered).toBe('');
            });

            it('refuses an empty message', async () => {
                const { session, sent } = sessionWithRecorder();

                await expect(session.sendMessage({ message: '' })).rejects.toThrow('A message is required');
                expect(sent).toHaveLength(0);
            });
        });
    });
});
