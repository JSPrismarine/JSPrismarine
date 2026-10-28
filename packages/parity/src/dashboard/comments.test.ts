import { describe, expect, it } from 'vitest';

import { findParityComment } from './comments.ts';

describe('parity report comment lookup', () => {
    it('returns the newest existing bot report so CI can update it', () => {
        const comments = [
            { id: 4, body: '<!-- parity-report --> old report', user: { login: 'github-actions[bot]' } },
            { id: 5, body: '<!-- parity-report --> user note', user: { login: 'contributor' } },
            { id: 9, body: '<!-- parity-report --> latest report', user: { login: 'github-actions[bot]' } }
        ];

        expect(findParityComment(comments, '<!-- parity-report -->')).toEqual(comments[2]);
    });

    it('returns no match when the bot has not posted the report yet', () => {
        const comments = [{ id: 4, body: 'a user comment', user: { login: 'contributor' } }];

        expect(findParityComment(comments, '<!-- parity-report -->')).toBeUndefined();
    });
});
