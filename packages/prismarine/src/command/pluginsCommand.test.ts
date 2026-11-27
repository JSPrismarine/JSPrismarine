import type { CommandSource } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { PluginSource } from '../plugins/PluginRegistry';
import { PluginRegistry } from '../plugins/PluginRegistry';
import { DEFAULT_PLAYER_PERMISSIONS } from '../permission/PermissionsFile';
import { stub } from '../testing/stub.test.helper';
import { PLUGINS_COMMAND_PERMISSION, registerPluginsCommand } from './pluginsCommand';

/** A registry holding `/plugins` for a server with these kinds of extension. */
const registryWith = (...sources: PluginSource[]): CommandRegistry<CommandSource> => {
    const plugins = new PluginRegistry();
    for (const pluginSource of sources) plugins.register(pluginSource);
    const registry = new CommandRegistry<CommandSource>();
    registerPluginsCommand(registry, stub<Server>({ getPlugins: () => plugins }));
    return registry;
};

/** Runs a line as a player at level 0, returning the command's result and its feedback. */
const run = (registry: CommandRegistry<CommandSource>, line: string) => {
    const feedback: string[] = [];
    const source = createCommandSource({
        host: testCommandHost(),
        permissionLevel: CommandPermissionLevel.ANY,
        onFeedback: (message) => void feedback.push(message)
    });
    return { result: registry.getDispatcher().execute(line, source), feedback };
};

const addons: PluginSource = {
    label: 'Addons',
    plugins: () => [
        { name: 'warps', version: '1.2.0', enabled: true },
        { name: 'tps-bar', version: '0.3.0', enabled: true }
    ]
};

describe('/plugins', () => {
    it("prints Paper's layout: the count, then each kind's heading and names", () => {
        const wasm: PluginSource = {
            label: 'WebAssembly Plugins',
            plugins: () => [{ name: 'broken', version: '1.0.0', enabled: false }]
        };

        expect(run(registryWith(addons, wasm), 'plugins')).toEqual({
            result: [3],
            feedback: [
                'Server Plugins (3):',
                '§6Addons:§r',
                ' - §atps-bar§r, §awarps§r',
                '§6WebAssembly Plugins:§r',
                ' - §cbroken§r'
            ]
        });
    });

    it('prints only the count when nothing is installed', () => {
        expect(run(registryWith(), 'plugins')).toEqual({ result: [0], feedback: ['Server Plugins (0):'] });
    });

    it('answers /pl, as Bukkit does', () => {
        const registry = registryWith(addons);
        expect(registry.getAliasOwner('pl')).toBe('plugins');
        expect(run(registry, 'pl').result).toEqual([2]);
    });

    it('lets every player run it, as Bukkit and Paper default it', () => {
        expect(registryWith().getMetadata('plugins')?.permissionLevel).toBe(CommandPermissionLevel.ANY);
        expect(DEFAULT_PLAYER_PERMISSIONS).toContain(PLUGINS_COMMAND_PERMISSION);
    });
});
