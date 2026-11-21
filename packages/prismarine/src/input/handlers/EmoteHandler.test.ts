import { EmoteFlags } from '@jsprismarine/protocol/bedrock/packet/EmotePacket';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import PlayerEmoteEvent from '../../events/player/PlayerEmoteEvent';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import type PlayerSession from '../../network/PlayerSession';
import EmoteHandler from './EmoteHandler';

const EMOTE_ID = '4c8ae710-df2e-47cd-814d-cc7bf21a3d67';

/** The sender, runtime id 7, in a world that records the emotes it is asked to show. */
const setup = (xuid: string) => {
    const logged: string[] = [];
    const relayed: OccurrenceKinds['emote'][] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')) });
    const world = stub<World>({ relayEmote: (emote) => void relayed.push(emote) });
    const session: PlayerSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: { ...STEVE, xuid },
        getWorld: () => world
    });
    const posted: string[] = [];
    const { context, outputs } = inputContext(session, {
        log,
        services: {
            events: {
                post: (name, event) => {
                    if (name === 'playerEmote' && event instanceof PlayerEmoteEvent) posted.push(event.getEmote());
                    return 0;
                }
            }
        }
    });
    return { logged, relayed, context, outputs, posted };
};

describe('input/handlers/EmoteHandler', () => {
    it("relays the emote under the sender XUID with the client's flags, posts the event and logs it", () => {
        const { logged, relayed, context, outputs, posted } = setup('steve-xuid');

        new EmoteHandler().handle(
            { kind: 'emote', emote: EMOTE_ID, lengthTicks: 40, platformId: 'p', flags: EmoteFlags.MuteChat },
            context
        );

        // The server's `playerEmote`, which a script's `world.afterEvents.playerEmote` hears.
        expect(posted).toEqual([EMOTE_ID]);
        // Logged in the handler's unit, and sent by replication after the tick seals.
        expect(outputs).toHaveLength(0);
        expect(relayed).toStrictEqual([
            {
                entity: 7n,
                emote: EMOTE_ID,
                lengthTicks: 40,
                xuid: 'steve-xuid',
                platformId: 'p',
                flags: EmoteFlags.MuteChat
            }
        ]);
        expect(logged).toEqual([`Steve played emote ${EMOTE_ID} for 40 ticks`]);
    });
});
