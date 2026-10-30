import { Difficulty } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import SetDifficultyPacket from '@jsprismarine/protocol/packet/SetDifficultyPacket';
import SetDifficultyHandler from './SetDifficultyHandler';

const fakeSession = (configured: Difficulty) => {
    const logged: string[] = [];
    const sent: NetworkPacket[] = [];

    return {
        logged,
        sent,
        server: stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
            getConfig: () => stub<Config>({ getDifficulty: () => configured })
        }),
        session: stub<PlayerSession>({
            getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
            getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) })
        })
    };
};

describe('SetDifficultyHandler', () => {
    it('logs the requested difficulty by name and sends the configured one back', async () => {
        const { logged, sent, server, session } = fakeSession(Difficulty.NORMAL);
        const packet = new SetDifficultyPacket({ difficulty: Difficulty.EASY });

        await new SetDifficultyHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve asked for difficulty EASY, which the server does not change']);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toBeInstanceOf(SetDifficultyPacket);
        expect(sent[0]?.getPacketData()).toEqual({ difficulty: Difficulty.NORMAL });
    });

    it('answers a value that is not a difficulty without throwing', async () => {
        const { logged, sent, server, session } = fakeSession(Difficulty.HARD);

        // 42 is not a `Difficulty`, so it has to come in off the wire.
        const packet = new SetDifficultyPacket(Buffer.from([0x3c, 0x2a]));
        packet.decode();

        await new SetDifficultyHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve asked for difficulty 42, which the server does not change']);
        expect(sent).toMatchObject([{ difficulty: Difficulty.HARD }]);
    });

    it('stays quiet when the client already shows the configured difficulty', async () => {
        const { logged, sent, server, session } = fakeSession(Difficulty.PEACEFUL);
        const packet = new SetDifficultyPacket({ difficulty: Difficulty.PEACEFUL });

        await new SetDifficultyHandler().handle(packet, server, session);

        expect(logged).toEqual([]);
        expect(sent).toEqual([]);
    });
});
