import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { World } from '../../world/World';
import { stub } from '../../testing/stub.test.helper';
import type DataPacket from '../packet/DataPacket';
import EmotePacket, { EmoteFlags } from '../packet/EmotePacket';
import type PlayerSession from '../PlayerSession';
import EmoteHandler from './EmoteHandler';

/** A player in the sender's world, with whether it has the sender on screen. */
const bystander = (name: string, tracking: boolean, sent: DataPacket[]) =>
    stub<Player>({
        getName: () => name,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => tracking,
                send: async (packet) => void sent.push(packet)
            })
    });

const request = () =>
    Object.assign(new EmotePacket(), {
        actorRuntimeId: 999n,
        emoteId: 'wave',
        emoteLengthTicks: 40,
        xuid: 'somebody-elses-xuid',
        platformId: 'p',
        flags: EmoteFlags.MuteChat
    });

describe('EmoteHandler', () => {
    it('relays the emote under the sender runtime id and XUID, and logs it', async () => {
        const logged: string[] = [];
        const sent: DataPacket[] = [];
        const watcher = bystander('Alex', true, sent);
        const sender: Player = stub<Player>({
            getName: () => 'Steve',
            getRuntimeId: () => 7n,
            getXUID: () => 'steve-xuid',
            getWorld: () => stub<World>({ getPlayers: () => [sender, watcher] })
        });
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => sender });

        await new EmoteHandler().handle(request(), server, session);

        expect(sent).toHaveLength(1);
        const relayed = sent[0];
        expect(relayed).toBeInstanceOf(EmotePacket);
        if (!(relayed instanceof EmotePacket)) return;
        expect(relayed.actorRuntimeId).toBe(7n);
        expect(relayed.emoteId).toBe('wave');
        expect(relayed.emoteLengthTicks).toBe(40);
        expect(relayed.xuid).toBe('steve-xuid');
        expect(relayed.flags).toBe(EmoteFlags.MuteChat | EmoteFlags.ServerSide);
        expect(logged).toEqual(['Steve played emote wave for 40 ticks, relayed to 1 player(s)']);
    });

    it('skips a player in the world that has not been sent the sender', async () => {
        const sent: DataPacket[] = [];
        const stranger = bystander('Alex', false, sent);
        const sender: Player = stub<Player>({
            getName: () => 'Steve',
            getRuntimeId: () => 7n,
            getXUID: () => null,
            getWorld: () => stub<World>({ getPlayers: () => [sender, stranger] })
        });
        const server = stub<Server>({ getLogger: () => stub<Logger>({ debug: () => {} }) });
        const session = stub<PlayerSession>({ getPlayer: () => sender });

        await new EmoteHandler().handle(request(), server, session);

        expect(sent).toEqual([]);
    });
});
