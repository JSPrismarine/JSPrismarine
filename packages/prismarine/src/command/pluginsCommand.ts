/**
 * `/plugins`, Bukkit's list of the extensions a server runs, with its `/pl` alias. Like Bukkit and
 * Paper, everyone may run it: the default `permissions.json` grants its node to every player.
 *
 * It prints Paper's layout, a count and then one heading per kind of extension, so a new kind
 * registered on {@link Server.getPlugins} shows up under its own heading.
 */
import type { CommandRegistry, CommandSource } from '@jsprismarine/commands';
import { command, lit, source } from '@jsprismarine/commands';

import type Server from '../Server';
import type { PluginGroup, ServerPlugin } from '../plugins/PluginRegistry';

/** The node that gates `/plugins`, Bukkit's `bukkit.command.plugins` in this server's namespace. */
export const PLUGINS_COMMAND_PERMISSION = 'jsprismarine.command.plugins';

/** One name, green while it runs and red when it does not, as Bukkit colors it. */
const pluginName = ({ name, enabled }: ServerPlugin): string => `${enabled ? '§a' : '§c'}${name}§r`;

/** How many extensions the groups hold together. */
const countOf = (groups: readonly PluginGroup[]): number =>
    groups.reduce((total, { plugins }) => total + plugins.length, 0);

/**
 * The lines `/plugins` prints: `Server Plugins (n):`, then each kind's heading and a line of
 * its names.
 */
export const describePlugins = (groups: readonly PluginGroup[]): string[] => [
    `Server Plugins (${countOf(groups)}):`,
    ...groups.flatMap(({ label, plugins }) => [`§6${label}:§r`, ` - ${plugins.map(pluginName).join(', ')}`])
];

/**
 * Registers `/plugins` into the registry the server dispatches.
 * @param server - The server whose extensions it lists, read when the command runs.
 */
export const registerPluginsCommand = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    registry.register(
        lit('plugins').executes(
            command((context) => {
                const current = source(context);
                const groups = server.getPlugins().groups();
                for (const line of describePlugins(groups)) current.sendFeedback(line);
                // Brigadier's result is the number of extensions, so `execute store` can count them.
                return countOf(groups);
            })
        ),
        { description: 'Lists the plugins and addons running on the server.', aliases: ['pl'] }
    );
};
