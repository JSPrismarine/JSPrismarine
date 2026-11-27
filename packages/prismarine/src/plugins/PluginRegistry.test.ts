import { describe, expect, it } from 'vitest';

import type { AddonManager } from '../addons/AddonManager';
import { stub } from '../testing/stub.test.helper';
import type { PluginSource } from './PluginRegistry';
import { PluginRegistry, addonPluginSource } from './PluginRegistry';

const wasm: PluginSource = {
    label: 'WebAssembly Plugins',
    plugins: () => [
        { name: 'zeta', version: '1.0.0', enabled: true },
        { name: 'Alpha', version: '2.0.0', enabled: false }
    ]
};

describe('PluginRegistry', () => {
    it('lists the installed addons as enabled plugins', () => {
        const plugins = new PluginRegistry();
        plugins.register(
            addonPluginSource(() => stub<AddonManager>({ loadedAddons: () => [{ name: 'warps', version: '1.2.0' }] }))
        );

        expect(plugins.groups()).toEqual([
            { label: 'Addons', plugins: [{ name: 'warps', version: '1.2.0', enabled: true }] }
        ]);
    });

    it('groups each kind in registration order, sorts names without case and skips empty kinds', () => {
        const plugins = new PluginRegistry();
        plugins.register(addonPluginSource(() => stub<AddonManager>({ loadedAddons: () => [] })));
        plugins.register(wasm);

        expect(plugins.groups().map(({ label }) => label)).toEqual(['WebAssembly Plugins']);
        expect(plugins.plugins().map(({ name }) => name)).toEqual(['Alpha', 'zeta']);
    });

    it('reads each source when asked, and drops one that unregisters', () => {
        const loaded = [{ name: 'warps', version: '1.2.0' }];
        const plugins = new PluginRegistry();
        plugins.register(addonPluginSource(() => stub<AddonManager>({ loadedAddons: () => loaded })));
        const unregister = plugins.register(wasm);

        loaded.push({ name: 'tps-bar', version: '0.3.0' });
        expect(plugins.plugins().map(({ name }) => name)).toEqual(['tps-bar', 'warps', 'Alpha', 'zeta']);

        unregister();
        expect(plugins.groups().map(({ label }) => label)).toEqual(['Addons']);
    });
});
