import { describe, expect, it } from 'vitest';

import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { exportNames } from './history';
import type { ModuleDependency, ResolveOptions } from './resolve';
import { resolveDependency } from './resolve';

/** `allowed_modules` in the pinned BDS's `config/default/permissions.json`, from section 2 of the research note. */
const BDS_ALLOWED_MODULES = [
    '@minecraft/server-gametest',
    '@minecraft/server',
    '@minecraft/server-ui',
    '@minecraft/server-admin',
    '@minecraft/server-editor',
    '@minecraft/debug-utilities'
];

const options: ResolveOptions = {
    pack: { name: 'jsp probe', version: '1.0.0' },
    allowedModules: [...BDS_ALLOWED_MODULES, '@minecraft/common', '@jsprismarine/server'],
    histories: SCRIPT_MODULE_HISTORIES
};

const server = (version: string): ModuleDependency => ({ module_name: '@minecraft/server', version });

describe('resolveDependency', () => {
    it.each([
        ['1.0.0', '1.19.0', 354],
        ['1.3.0', '1.19.0', 354],
        ['2.0.0', '2.11.0', 559],
        ['2.10.0', '2.11.0', 559],
        ['2.11.0', '2.11.0', 559]
    ])('serves a pack declaring %s the %s API, with its %i exports', (declared, served, exports) => {
        const resolution = resolveDependency(server(declared), options);

        if (!resolution.ok) throw new Error(resolution.message);
        expect(resolution.shape.version.version).toBe(served);
        expect(exportNames(resolution.shape)).toHaveLength(exports);
    });

    it('serves 2.x members to a 2.0.0 pack and 1.x members to a 1.x pack', () => {
        const v2 = resolveDependency(server('2.0.0'), options);
        const v1 = resolveDependency(server('1.0.0'), options);
        if (!v2.ok || !v1.ok) throw new Error('both versions resolve');

        expect(v2.shape.declarations.get('StartupEvent')?.members.has('customCommandRegistry')).toBe(true);
        expect(v2.shape.declarations.has('WorldLoadAfterEvent')).toBe(true);
        expect(v1.shape.declarations.has('WorldInitializeAfterEvent')).toBe(true);
        expect(v1.shape.declarations.get('Dimension')?.members.has('runCommandAsync')).toBe(true);
        expect(v2.shape.declarations.get('Dimension')?.members.has('runCommandAsync')).toBe(false);
    });

    it('refuses a module the world does not allow, before looking it up', () => {
        const resolution = resolveDependency(
            { module_name: '@jsprismarine/server', version: '1.0.0' },
            { ...options, allowedModules: BDS_ALLOWED_MODULES }
        );

        expect(resolution).toEqual({
            ok: false,
            reason: 'not-allowed',
            message:
                'Plugin [jsp probe - 1.0.0] - requesting dependency on module [@jsprismarine/server] but it is not configured to use it.'
        });
    });

    it('refuses an allowed module BDS does not know', () => {
        const resolution = resolveDependency({ module_name: '@jsprismarine/server', version: '1.0.0' }, options);

        expect(resolution).toEqual({
            ok: false,
            reason: 'unknown-module',
            message:
                'Plugin [jsp probe] - module [jsp probe - 1.0.0] depends on unknown module [@jsprismarine/server - 1.0.0].'
        });
    });

    it.each(['3.0.0', '2.12.0', '1.20.0', 'latest'])(
        'refuses @minecraft/server %s, which BDS does not ship, listing the versions it does',
        (version) => {
            expect(resolveDependency(server(version), options)).toEqual({
                ok: false,
                reason: 'unknown-version',
                message:
                    `Plugin [jsp probe] - module [jsp probe - 1.0.0] requested invalid version [${version}] of [@minecraft/server].\n` +
                    '\nAvailable versions:\n1.19.0\n2.11.0\n2.12.0-beta'
            });
        }
    );

    it.each([
        ['2.12.0-beta', '2.12.0-beta'],
        ['2.13.0-beta', '2.13.0-beta'],
        ['beta', '2.12.0-beta']
    ])('refuses beta version %s without the Beta APIs experiment, naming it %s', (version, named) => {
        expect(resolveDependency(server(version), options)).toEqual({
            ok: false,
            reason: 'beta-disabled',
            message: `Plugin [jsp probe - 1.0.0] - requesting dependency on beta APIs [@minecraft/server - ${named}], but the Beta APIs experiment is not enabled.`
        });
    });

    it('serves the beta version BDS ships to a pack that declares the word beta', () => {
        const resolution = resolveDependency(server('beta'), { ...options, betaApis: true });

        if (!resolution.ok) throw new Error(resolution.message);
        expect(resolution.shape.version.version).toBe('2.12.0-beta');
    });

    it.each(['2.13.0-beta', '2.11.0-beta', '2.9.0-beta', '1.17.0-beta', '3.0.0-beta'])(
        'refuses beta version %s, which BDS does not ship, naming the beta it does',
        (version) => {
            expect(resolveDependency(server(version), { ...options, betaApis: true })).toEqual({
                ok: false,
                reason: 'unknown-version',
                message:
                    `Plugin [jsp probe] - module [jsp probe - 1.0.0] requested invalid version [${version}] of [@minecraft/server].\n` +
                    '\nCurrent [beta] version is [2.12.0-beta].\n' +
                    '\nAvailable versions:\n1.19.0\n2.11.0\n2.12.0-beta'
            });
        }
    );

    it('serves the beta of another module beside a stable @minecraft/server', () => {
        const resolution = resolveDependency(
            { module_name: '@minecraft/server-gametest', version: '1.0.0-beta' },
            { ...options, betaApis: true }
        );

        if (!resolution.ok) throw new Error(resolution.message);
        expect(resolution.shape.version.version).toBe('1.0.0-beta');
    });

    it('serves the beta version BDS ships, with its 601 exports, when the experiment is on', () => {
        const resolution = resolveDependency(server('2.12.0-beta'), { ...options, betaApis: true });

        if (!resolution.ok) throw new Error(resolution.message);
        expect(resolution.shape.version).toMatchObject({ version: '2.12.0-beta', stability: 'beta' });
        expect(exportNames(resolution.shape)).toHaveLength(601);
        expect(resolution.shape.declarations.get('WorldBeforeEvents')?.members.has('chatSend')).toBe(true);
    });

    it('serves the metadata with its overrides applied', () => {
        const resolution = resolveDependency(server('2.0.0'), options);
        if (!resolution.ok) throw new Error(resolution.message);
        const register = resolution.shape.declarations.get('CustomCommandRegistry')?.members.get('registerCommand');

        expect(register).toMatchObject({
            override: 'custom-command-callback-restricted',
            arguments: [
                { name: 'customCommand' },
                { name: 'callback', type: { kind: 'closure', privilege: ['restricted_execution'] } }
            ]
        });
    });

    it('refuses internal versions', () => {
        expect(resolveDependency(server('internal'), options)).toMatchObject({ ok: false, reason: 'internal' });
    });
});
