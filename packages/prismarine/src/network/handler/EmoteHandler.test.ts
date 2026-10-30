import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import type PlayerSession from '../PlayerSession';
import EmoteHandler from './EmoteHandler';

const EMOTE_ID = '4c8ae710-df2e-47cd-814d-cc7bf21a3d67';

/** A player in the sender's world, with whether it has the sender on screen. */
const bystander = (name: string, tracking: boolean, sent: NetworkPacket[]) =>
    stub<Player>({
        getName: () => name,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => tracking,
                send: async (packet) => void sent.push(packet)
            })
    });

/** The sender, runtime id 7, in a world with `others`, plus everything the handler reads. */
const setup = (xuid: string | null, others: (sender: Player) => Player[]) => {
    const logged: string[] = [];
    const sender: Player = stub<Player>({
        getName: () => 'Steve',
        getRuntimeId: () => 7n,
        getXUID: () => xuid,
        getWorld: () => stub<World>({ getPlayers: () => [sender, ...others(sender)] })
    });
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => sender });
    return { logged, server, session };
};

const request = (overrides: StubMembers<EmotePacket> = {}) =>
    Object.assign(
        new EmotePacket(),
        {
            actorRuntimeId: 7n,
            emoteId: EMOTE_ID,
            emoteLengthTicks: 40,
            xuid: 'somebody-elses-xuid',
            platformId: 'p',
            flags: EmoteFlags.MuteChat
        },
        overrides
    );

describe('EmoteHandler', () => {
    it('relays a fresh packet under the sender XUID with the ServerSide flag, and logs it', async () => {
        const sent: NetworkPacket[] = [];
        const { logged, server, session } = setup('steve-xuid', () => [bystander('Alex', true, sent)]);
        const incoming = request();

        await new EmoteHandler().handle(incoming, server, session);

        expect(sent).toHaveLength(1);
        const relayed = sent[0];
        expect(relayed).toBeInstanceOf(EmotePacket);
        if (!(relayed instanceof EmotePacket)) return;
        expect(relayed).not.toBe(incoming);
        expect(relayed.actorRuntimeId).toBe(7n);
        expect(relayed.emoteId).toBe(EMOTE_ID);
        expect(relayed.emoteLengthTicks).toBe(40);
        expect(relayed.xuid).toBe('steve-xuid');
        expect(relayed.platformId).toBe('p');
        expect(relayed.flags).toBe(EmoteFlags.MuteChat | EmoteFlags.ServerSide);
        expect(logged).toEqual([`Steve played emote ${EMOTE_ID} for 40 ticks, relayed to 1 player(s)`]);
    });

    it('encodes the relay from its own fields, not the bytes the client sent', async () => {
        const sent: NetworkPacket[] = [];
        const { server, session } = setup(null, () => [bystander('Alex', true, sent)]);
        const incoming = request({ flags: 0 });
        incoming.encode();

        await new EmoteHandler().handle(incoming, server, session);

        const relayed = sent[0];
        if (!(relayed instanceof EmotePacket)) throw new Error('nothing relayed');
        relayed.encode();
        const expected = request({ xuid: '', flags: EmoteFlags.ServerSide });
        expected.encode();
        expect(relayed.getBuffer()).toEqual(expected.getBuffer());
        expect(relayed.getBuffer()).not.toEqual(incoming.getBuffer());
    });

    it('skips a player in the world that has not been sent the sender', async () => {
        const sent: NetworkPacket[] = [];
        const { server, session } = setup(null, () => [bystander('Alex', false, sent)]);

        await new EmoteHandler().handle(request(), server, session);

        expect(sent).toEqual([]);
    });

    it('drops an emote for another runtime id at debug level', async () => {
        const sent: NetworkPacket[] = [];
        const { logged, server, session } = setup('steve-xuid', () => [bystander('Alex', true, sent)]);

        await new EmoteHandler().handle(request({ actorRuntimeId: 999n }), server, session);

        expect(sent).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote for runtime id 999, dropped']);
    });

    it('drops an emote whose id is not a uuid string', async () => {
        const sent: NetworkPacket[] = [];
        const { logged, server, session } = setup('steve-xuid', () => [bystander('Alex', true, sent)]);

        await new EmoteHandler().handle(request({ emoteId: 'wave' }), server, session);

        expect(sent).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote whose id "wave" is not a uuid, dropped']);
    });
});
