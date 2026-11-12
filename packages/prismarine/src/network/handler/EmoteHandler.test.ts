import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import type PlayerSession from '../PlayerSession';
import EmoteHandler from './EmoteHandler';

const EMOTE_ID = '4c8ae710-df2e-47cd-814d-cc7bf21a3d67';

/** The sender, runtime id 7, in a world that records the emotes it is asked to show. */
const setup = (xuid: string | null) => {
    const logged: string[] = [];
    const relayed: OccurrenceKinds['emote'][] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const world = stub<World>({ relayEmote: (emote) => void relayed.push(emote) });
    const session: PlayerSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: { ...STEVE, xuid: xuid ?? '' },
        getWorld: () => world
    });
    const { context, outputs } = inputContext(session, { log });
    return { logged, relayed, context, outputs };
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
    it('relays the emote under the sender XUID with the ServerSide flag, and logs it', () => {
        const { logged, relayed, context, outputs } = setup('steve-xuid');

        new EmoteHandler().handle(request(), context);

        // Logged in the handler's unit, and sent by replication after the tick seals.
        expect(outputs).toHaveLength(0);
        expect(relayed).toStrictEqual([
            {
                entity: 7n,
                emote: EMOTE_ID,
                lengthTicks: 40,
                xuid: 'steve-xuid',
                platformId: 'p',
                flags: EmoteFlags.MuteChat | EmoteFlags.ServerSide
            }
        ]);
        expect(logged).toEqual([`Steve played emote ${EMOTE_ID} for 40 ticks`]);
    });

    it('drops an emote for another runtime id at debug level', () => {
        const { logged, relayed, context } = setup('steve-xuid');

        new EmoteHandler().handle(request({ actorRuntimeId: 999n }), context);

        expect(relayed).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote for runtime id 999, dropped']);
    });

    it('drops an emote whose id is not a uuid string', () => {
        const { logged, relayed, context } = setup('steve-xuid');

        new EmoteHandler().handle(request({ emoteId: 'wave' }), context);

        expect(relayed).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote whose id "wave" is not a uuid, dropped']);
    });
});
