import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/bedrock/packet/ShowCreditsPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import ShowCreditsDecoder from './ShowCreditsDecoder';

const credits = (creditsState: CreditsState) => Object.assign(new ShowCreditsPacket(), { creditsState });

describe('ShowCreditsDecoder', () => {
    it('decodes a finish', () => {
        const { view, logged } = decodeView({ name: 'Steve' });

        expect(new ShowCreditsDecoder().decode(credits(CreditsState.Finished), view)).toStrictEqual([
            { kind: 'finishCredits' }
        ]);
        expect(logged).toEqual([]);
    });

    it('logs a client-sent start and drops it', () => {
        const { view, logged } = decodeView({ name: 'Steve' });

        expect(new ShowCreditsDecoder().decode(credits(CreditsState.Start), view)).toEqual([]);
        expect(logged).toEqual(['Steve reported the end credits started, which only the server may say']);
    });
});
