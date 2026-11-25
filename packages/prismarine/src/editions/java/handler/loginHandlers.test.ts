import { describe, expect, it } from 'vitest';

import { javaRefusalReason } from './loginHandlers';

describe('javaRefusalReason', () => {
    it.each([
        [{ kind: 'banned', reason: '' }, { translate: 'multiplayer.disconnect.banned' }],
        [
            { kind: 'banned', reason: 'griefing' },
            { translate: 'multiplayer.disconnect.banned.reason', with: ['griefing'] }
        ],
        [{ kind: 'notInvited' }, { translate: 'multiplayer.disconnect.not_whitelisted' }],
        [{ kind: 'full' }, { translate: 'multiplayer.disconnect.server_full' }]
    ] as const)('tells %o in the words vanilla uses', (refusal, reason) => {
        expect(JSON.parse(javaRefusalReason(refusal))).toEqual(reason);
    });
});
