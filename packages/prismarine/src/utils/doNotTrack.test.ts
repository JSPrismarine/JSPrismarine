import { describe, expect, it } from 'vitest';

import { DO_NOT_TRACK_OPT_IN, DO_NOT_TRACK_VARIABLE, isDoNotTrack } from './doNotTrack';

describe('isDoNotTrack', () => {
    it('leaves the decision to each feature when unset or set to the opt-in', () => {
        expect(isDoNotTrack({})).toBe(false);
        expect(isDoNotTrack({ [DO_NOT_TRACK_VARIABLE]: DO_NOT_TRACK_OPT_IN })).toBe(false);
    });

    it.each(['1', 'true', 'yes', 'nope', ''])('opts out for DO_NOT_TRACK=%j', (value) => {
        expect(isDoNotTrack({ [DO_NOT_TRACK_VARIABLE]: value })).toBe(true);
    });
});
