import type { Module } from '@jsprismarine/kernel';

import type { CommandManager } from '../command/CommandManager';
import { finishStartupPhase, startStartupPhase } from '../profiling/startupPhase';
import { commandsToken, contentToken, permissionsToken, worldsToken } from './tokens';

/**
 * Provides the {@link CommandManager} as `prismarine:commands`. Starting the module builds the
 * command registry, whose arguments validate against the content build, and whose dispatch checks
 * the permission manager.
 *
 * It does not depend on the worlds: the console reads commands while the start region is still
 * generating, so the registry has to be up before the worlds module starts. `Server` registers it
 * first for that reason.
 *
 * @param commands - The command manager.
 * @returns The module to register on the kernel.
 */
export const commandsModule = (commands: CommandManager): Module => ({
    id: 'prismarine:commands',
    dependencies: [contentToken, permissionsToken],
    register: (ctx) => {
        ctx.provide(commandsToken, commands);
    },
    start: async () => {
        const startedAt = startStartupPhase();
        await commands.enable();
        finishStartupPhase('command-build', startedAt);
    },
    stop: () => commands.disable()
});

/**
 * Runs the `#minecraft:load` functions once the commands and the worlds are both up, because a
 * load function is allowed to touch a world.
 *
 * @param commands - The command manager that runs them.
 * @returns The module to register on the kernel.
 */
export const loadFunctionsModule = (commands: CommandManager): Module => ({
    id: 'prismarine:load-functions',
    dependencies: [commandsToken, worldsToken],
    register: () => {},
    start: async () => {
        await commands.runLoadFunctions();
    }
});
