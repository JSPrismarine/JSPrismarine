import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/bedrock/packet/EmotePacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import type { StubMembers } from '../../../testing/stub.test.helper';
import EmoteDecoder from './EmoteDecoder';

const EMOTE_ID = '4c8ae710-df2e-47cd-814d-cc7bf21a3d67';

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

describe('EmoteDecoder', () => {
    it('decodes an emote the sender plays on itself, leaving the XUID it claims out', () => {
        const { view, logged } = decodeView({ name: 'Steve' });

        expect(new EmoteDecoder().decode(request(), view)).toStrictEqual([
            { kind: 'emote', emote: EMOTE_ID, lengthTicks: 40, platformId: 'p', flags: EmoteFlags.MuteChat }
        ]);
        expect(logged).toEqual([]);
    });

    it('drops an emote for another runtime id at debug level', () => {
        const { view, logged } = decodeView({ name: 'Steve' });

        expect(new EmoteDecoder().decode(request({ actorRuntimeId: 999n }), view)).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote for runtime id 999, dropped']);
    });

    it('drops an emote whose id is not a uuid string', () => {
        const { view, logged } = decodeView({ name: 'Steve' });

        expect(new EmoteDecoder().decode(request({ emoteId: 'wave' }), view)).toEqual([]);
        expect(logged).toEqual(['Steve sent an Emote whose id "wave" is not a uuid, dropped']);
    });
});
