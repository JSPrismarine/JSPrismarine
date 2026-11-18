import { describe, expect, it } from 'vitest';

import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import Codec2259 from './Codec2259';
import { DEFAULT_PROTOCOL_SETTINGS, resolveProtocolPolicy } from './ProtocolPolicy';

/** The build's codecs, newest first, as the registry orders them. */
const codecs = [Codec2259, Codec2225, Codec2193];

describe('network/codec/ProtocolPolicy', () => {
    it('accepts the newest release only by default, with its content, and the preview beside it', () => {
        const policy = resolveProtocolPolicy(DEFAULT_PROTOCOL_SETTINGS, codecs);

        expect(policy.releases).toEqual([Codec2225]);
        expect(policy.content).toBe(Codec2225);
        expect(policy.accepted).toEqual([Codec2259, Codec2225]);
        expect(policy.codecFor(2193)).toBeUndefined();
        expect(policy.codecFor(2259)).toBe(Codec2259);
        expect(policy.clampedFrom).toBeUndefined();
    });

    it('counts the window back from the newest release, so a newer build moves it with no config change', () => {
        const settings = { window: 2, content: 'oldest' } as const;

        const today = resolveProtocolPolicy(settings, codecs);
        expect(today.releases).toEqual([Codec2225, Codec2193]);
        expect(today.content).toBe(Codec2193);

        // A build whose newest release is 2259 and that no longer ships 2193.
        const release2259 = { ...Codec2259, preview: false };
        const upgraded = resolveProtocolPolicy(settings, [release2259, Codec2225]);
        expect(upgraded.releases).toEqual([release2259, Codec2225]);
        expect(upgraded.content).toBe(Codec2225);
        expect(upgraded.codecFor(2193)).toBeUndefined();
    });

    it('takes the content from the newest release in the window unless told the oldest', () => {
        expect(resolveProtocolPolicy({ window: 2, content: 'newest' }, codecs).content).toBe(Codec2225);
    });

    it('clamps a window wider than the build supports, and says it did', () => {
        const policy = resolveProtocolPolicy({ window: 5, content: 'oldest' }, codecs);

        expect(policy.releases).toEqual([Codec2225, Codec2193]);
        expect(policy.content).toBe(Codec2193);
        expect(policy.clampedFrom).toBe(5);
    });

    it('treats a window below one as the newest release only', () => {
        expect(resolveProtocolPolicy({ window: 0, content: 'newest' }, codecs).releases).toEqual([Codec2225]);
    });
});
