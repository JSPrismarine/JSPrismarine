import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import PlayerSession from './PlayerSession';
import { TextPacketType } from '@jsprismarine/protocol';

/** A session whose connection records what goes out. */
const sessionWithRecorder = () => {
    const sent: NetworkPacket[] = [];
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

                expect(packet.getPacketData()).toEqual({
                    type: TextPacketType.Chat,
                    needsTranslation: false,
                    sourceName: 'Server',
                    message: 'hello',
                    parameters: [],
                    xuid: '',
                    platformChatId: '',
                    filtered: ''
                });
            });

            it('refuses an empty message', async () => {
                const { session, sent } = sessionWithRecorder();

                await expect(session.sendMessage({ message: '' })).rejects.toThrow('A message is required');
                expect(sent).toHaveLength(0);
            });
        });
    });
});
