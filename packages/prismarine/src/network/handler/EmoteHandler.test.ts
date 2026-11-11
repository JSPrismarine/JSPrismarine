import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import type PlayerSession from '../PlayerSession';
import EmoteHandler from './EmoteHandler';

const EMOTE_ID = '4c8ae710-df2e-47cd-814d-cc7bf21a3d67';

/** A client in the sender's world, with whether it has the sender on screen. */
const bystander = (tracking: boolean, sent: NetworkPacket[]) =>
    stub<PlayerSession>({
        runtimeId: 99n,
        tracks: () => tracking,
        send: async (packet) => void sent.push(packet)
    });

/** The sender, runtime id 7, in a world with `others`, plus everything the handler reads. */
const setup = (xuid: string | null, others: () => PlayerSession[]) => {
    const logged: string[] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const session: PlayerSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: { ...STEVE, xuid: xuid ?? '' },
        getWorld: () => stub<World>({ getViewers: () => [session, ...others()] })
    });
    const { context, outputs, settled } = inputContext(session, { log });
    return { logged, context, outputs, settled };
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
        const { logged, context, outputs, settled } = setup('steve-xuid', () => [bystander(true, sent)]);
        const incoming = request();

        new EmoteHandler().handle(incoming, context);
        // One send for the one watcher, handed to the input step rather than awaited.
        expect(outputs).toHaveLength(1);
        await settled();

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
        const { context, settled } = setup(null, () => [bystander(true, sent)]);
        const incoming = request({ flags: 0 });
        incoming.encode();

        new EmoteHandler().handle(incoming, context);
        await settled();

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
        const { context, settled } = setup(null, () => [bystander(false, sent)]);

        new EmoteHandler().handle(request(), context);
        await settled();

        expect(sent).toEqual([]);
    });

    it('drops an emote for another runtime id at debug level', async () => {
        const sent: NetworkPacket[] = [];
        const { logged, context, settled } = setup('steve-xuid', () => [bystander(true, sent)]);

        new EmoteHandler().handle(request({ actorRuntimeId: 999n }), context);
        await settled();

        expect(sent).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote for runtime id 999, dropped']);
    });

    it('drops an emote whose id is not a uuid string', async () => {
        const sent: NetworkPacket[] = [];
        const { logged, context, settled } = setup('steve-xuid', () => [bystander(true, sent)]);

        new EmoteHandler().handle(request({ emoteId: 'wave' }), context);
        await settled();

        expect(sent).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote whose id "wave" is not a uuid, dropped']);
    });
});
