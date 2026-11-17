/**
 * The `custom-command-errors` scenario: what a script's `runCommand` throws for a custom command
 * whose arguments do not parse, for a name BDS dropped because it has an upper-case letter, and
 * for one registered too late to exist.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { CommandPermissionLevel, CustomCommandParamType, system, world } from '@minecraft/server';

const PACK = 'errors';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

let registry;

system.beforeEvents.startup.subscribe((event) => {
    registry = event.customCommandRegistry;
    registry.registerCommand(
        {
            name: 'jsp:count',
            description: 'Takes an integer',
            permissionLevel: CommandPermissionLevel.Any,
            mandatoryParameters: [{ name: 'count', type: CustomCommandParamType.Integer }]
        },
        () => undefined
    );
    registry.registerCommand(
        {
            name: 'jsp:kind',
            description: 'Takes an entity type',
            permissionLevel: CommandPermissionLevel.Any,
            mandatoryParameters: [{ name: 'entity', type: CustomCommandParamType.EntityType }]
        },
        () => undefined
    );
    registry.registerCommand(
        { name: 'jsp:Shout', description: 'Upper case', permissionLevel: CommandPermissionLevel.Any },
        () => undefined
    );
});

world.afterEvents.worldLoad.subscribe(() => {
    try {
        registry.registerCommand(
            { name: 'jsp:late', description: 'Too late', permissionLevel: CommandPermissionLevel.Any },
            () => undefined
        );
    } catch {
        // The custom-commands scenario records this error.
    }
    const overworld = world.getDimension('overworld');
    for (const command of ['jsp:count seven', 'jsp:kind jsp_nothing', 'jsp:shout', 'jsp:Shout', 'jsp:late']) {
        try {
            record(`runCommand ${command}`, { value: overworld.runCommand(command).successCount });
        } catch (error) {
            record(`runCommand ${command}`, { error: String(error) });
        }
    }
    console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
});
