import { describe, expect, it } from 'vitest';

import { decideUpdateCheck, UPDATE_CHECK_OPT_OUT } from './decision';
import { DEFAULT_UPDATE_SOURCE } from './feed';
import { DEFAULT_UPDATE_SETTINGS, readUpdateSettings } from './settings';

const releaseBuild = { version: '0.25.0', type: 'release' } as const;

describe('decideUpdateCheck', () => {
    it('checks a release executable on the release channel at the site', () => {
        expect(decideUpdateCheck({ env: {}, settings: DEFAULT_UPDATE_SETTINGS, build: releaseBuild })).toEqual({
            on: true,
            target: { channel: 'release', source: DEFAULT_UPDATE_SOURCE }
        });
    });

    it('follows the nightly channel and the stamped source of a fork nightly', () => {
        const decision = decideUpdateCheck({
            env: {},
            settings: DEFAULT_UPDATE_SETTINGS,
            build: { version: '0.26.0-nightly.20261125.1', type: 'nightly', updateSource: 'someone/fork' }
        });

        expect(decision).toEqual({ on: true, target: { channel: 'nightly', source: 'someone/fork' } });
    });

    it('keeps an npm unstable snapshot on the release channel', () => {
        const decision = decideUpdateCheck({
            env: {},
            settings: DEFAULT_UPDATE_SETTINGS,
            build: { version: '0.26.0-unstable-20261125000000', dist: true }
        });

        expect(decision).toMatchObject({ on: true, target: { channel: 'release' } });
    });

    it('lets the config choose the channel and source', () => {
        const settings = readUpdateSettings({ channel: 'nightly', source: 'https://example.com/feed' });

        expect(decideUpdateCheck({ env: {}, settings, build: releaseBuild })).toEqual({
            on: true,
            target: { channel: 'nightly', source: 'https://example.com/feed' }
        });
    });

    it('stays off for a checkout unless the config turns it on', () => {
        expect(decideUpdateCheck({ env: {}, settings: DEFAULT_UPDATE_SETTINGS, build: {} })).toMatchObject({
            on: false,
            level: 'debug'
        });
        expect(
            decideUpdateCheck({ env: {}, settings: readUpdateSettings({ enabled: true }), build: {} })
        ).toMatchObject({ on: true });
    });

    it.each([
        ['the test runner', { VITEST: 'true' }],
        ['CI', { CI: '' }],
        ['the opt-out variable', { [UPDATE_CHECK_OPT_OUT.variable]: 'OFF' }]
    ])('stays off under %s whatever the config says', (_name, env) => {
        const settings = readUpdateSettings({ enabled: true });

        expect(decideUpdateCheck({ env, settings, build: releaseBuild })).toMatchObject({ on: false, level: 'debug' });
    });

    it('warns about an opt-out value it does not take, and about a setting it cannot use', () => {
        expect(
            decideUpdateCheck({
                env: { [UPDATE_CHECK_OPT_OUT.variable]: 'maybe' },
                settings: DEFAULT_UPDATE_SETTINGS,
                build: releaseBuild
            })
        ).toMatchObject({ on: false, level: 'warn' });
        expect(
            decideUpdateCheck({ env: {}, settings: readUpdateSettings({ source: 'nowhere' }), build: releaseBuild })
        ).toMatchObject({ on: false, level: 'warn' });
    });

    it('leaves the decision to the config for an opt-in value', () => {
        expect(
            decideUpdateCheck({
                env: { [UPDATE_CHECK_OPT_OUT.variable]: 'yes' },
                settings: readUpdateSettings({ enabled: false }),
                build: releaseBuild
            })
        ).toMatchObject({ on: false, level: 'debug' });
    });
});
