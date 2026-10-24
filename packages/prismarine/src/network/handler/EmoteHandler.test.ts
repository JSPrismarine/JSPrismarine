import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import { stub } from '../../testing/stub.test.helper';
import type DataPacket from '../packet/DataPacket';
import EmotePacket, { EmoteFlags } from '../packet/EmotePacket';
import type PlayerSession from '../PlayerSession';
import EmoteHandler from './EmoteHandler';

describe('EmoteHandler', () => {
    it('relays the emote to the other players under the sender runtime id and logs it', async () => {
        const logged: string[] = [];
        const sent: DataPacket[] = [];
        const sender = stub<Player>({ getName: () => 'Steve', getRuntimeId: () => 7n });
        const other = stub<Player>({
            getName: () => 'Alex',
            getNetworkSession: () => stub<PlayerSession>({ send: async (packet) => void sent.push(packet) })
        });
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
            getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => [sender, other] })
        });
        const session = stub<PlayerSession>({ getPlayer: () => sender });
        const packet = Object.assign(new EmotePacket(), {
            actorRuntimeId: 999n,
            emoteId: 'wave',
            emoteLengthTicks: 40,
            xuid: '1',
            platformId: 'p',
            flags: EmoteFlags.MuteChat
        });

        await new EmoteHandler().handle(packet, server, session);

        expect(sent).toHaveLength(1);
        const relayed = sent[0];
        expect(relayed).toBeInstanceOf(EmotePacket);
        if (!(relayed instanceof EmotePacket)) return;
        expect(relayed.actorRuntimeId).toBe(7n);
        expect(relayed.emoteId).toBe('wave');
        expect(relayed.emoteLengthTicks).toBe(40);
        expect(relayed.flags).toBe(EmoteFlags.MuteChat | EmoteFlags.ServerSide);
        expect(logged).toEqual(['Steve played emote wave for 40 ticks, relayed to 1 player(s)']);
    });
});
