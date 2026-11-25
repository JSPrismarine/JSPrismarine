import { describe, expect, it } from 'vitest';

import { DEFAULT_UPDATE_SETTINGS, readUpdateSettings, UPDATE_INTERVAL_MINUTES } from './settings';

describe('readUpdateSettings', () => {
    it('leaves every key to the build when the section is empty or missing', () => {
        expect(readUpdateSettings(undefined)).toEqual(DEFAULT_UPDATE_SETTINGS);
        expect(readUpdateSettings({})).toEqual(DEFAULT_UPDATE_SETTINGS);
    });

    it('reads the keys a section sets', () => {
        expect(readUpdateSettings({ enabled: true, channel: 'nightly', source: 'someone/fork', interval: 90 })).toEqual(
            {
                enabled: true,
                channel: 'nightly',
                source: 'someone/fork',
                interval: 90,
                problems: [],
                disabledByProblem: false
            }
        );
    });

    it.each([
        ['an enabled that is not a boolean', { enabled: 'yes' }],
        ['a source that is neither owner/repo nor https', { source: 'http://example.com' }],
        ['a section that is not one', 'on']
    ])('turns checks off for %s, saying why', (_name, section) => {
        const settings = readUpdateSettings(section);

        expect(settings.enabled).toBe(false);
        expect(settings.disabledByProblem).toBe(true);
        expect(settings.problems).toHaveLength(1);
    });

    it('follows the build for a channel it does not know, saying so', () => {
        const settings = readUpdateSettings({ channel: 'beta' });

        expect(settings.channel).toBeUndefined();
        expect(settings.disabledByProblem).toBe(false);
        expect(settings.problems).toEqual([expect.stringContaining('updates.channel')]);
    });

    it('raises an interval under the minimum to it and keeps the default for one that is not a number', () => {
        expect(readUpdateSettings({ interval: 5 }).interval).toBe(UPDATE_INTERVAL_MINUTES.minimum);
        expect(readUpdateSettings({ interval: '5' }).interval).toBe(UPDATE_INTERVAL_MINUTES.default);
    });
});
