import { basicParseSymbol, flattenCommandTree } from '@jsprismarine/commands';
import type { BedrockParameterTypeName } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import AvailableCommandsPacket from '../network/packet/AvailableCommandsPacket';
import { CommandParameterFlags, CommandParameterTypeFlag } from '../network/type/CommandParameter';
import { PARAMETER_TYPES, commandDataOf } from './availableCommands';
import { buildVanillaCommands } from './vanillaCommands';

const flattened = flattenCommandTree(buildVanillaCommands()).commands;
const find = (name: string) => flattened.find((command) => command.name === name)!;

describe('the available-commands bridge', () => {
    it('writes every basic type as the parse symbol the command layer computes', () => {
        // Two copies of the protocol-2193 ids exist, one per package. This is
        // the join between them, and a drift in either would be a parameter
        // the client parses as the wrong thing.
        for (const [name, type] of Object.entries(PARAMETER_TYPES)) {
            expect(CommandParameterTypeFlag.Valid | type).toBe(basicParseSymbol(name as BedrockParameterTypeName));
        }
    });

    it('carries the name, description and level of a command', () => {
        const data = commandDataOf(find('say'), CommandPermissionLevel.GAME_DIRECTORS);

        expect(data.commandName).toBe('say');
        expect(data.commandDescription).toBe('Sends a message to everyone.');
        expect(data.permission).toBe(CommandPermissionLevel.GAME_DIRECTORS);
    });

    it('lists the command itself first in its alias enum', () => {
        const data = commandDataOf(find('teleport'), CommandPermissionLevel.ANY);

        expect(data.aliases?.name).toBe('teleportAliases');
        expect(data.aliases?.values).toEqual(['teleport', 'tp']);
    });

    it('leaves the alias enum unset for a command with no aliases', () => {
        expect(commandDataOf(find('say'), CommandPermissionLevel.ANY).aliases).toBeNull();
    });

    it('collapses a one-value enum, which is how a subcommand keyword is spelled', () => {
        const keyword = commandDataOf(find('time'), CommandPermissionLevel.ANY)
            .overloads.flat()
            .find((parameter) => parameter.enum?.values.length === 1);

        expect(keyword?.flags).toBe(CommandParameterFlags.FORCE_COLLAPSE_ENUM);
    });

    it('points a chained parameter at the table the command declares', () => {
        // `/execute` is the only command with a cycle, and the parameter and
        // the declared table have to be the same object so the packet gives
        // them one index.
        const data = commandDataOf(find('execute'), CommandPermissionLevel.GAME_DIRECTORS);
        const chained = data.overloads.flat().find((parameter) => parameter.chainedSubcommand !== null);

        expect(data.chainedSubcommands).not.toHaveLength(0);
        expect(chained?.chainedSubcommand).toBe(data.chainedSubcommands[0]);
        expect(chained?.chainedSubcommand?.values).toContain('as');
        expect(chained?.chainedSubcommand?.values).toContain('run');
    });

    it('encodes the whole wired set without throwing', () => {
        // The packet writes widths the bridge has to stay inside: a uint16
        // flags word, a uint8 permission and a uint32 per enum index.
        const packet = new AvailableCommandsPacket();
        packet.commandData = flattened.map((command) => commandDataOf(command, command.permissionLevel));

        expect(() => packet.encodePayload()).not.toThrow();
        expect(packet.commandData.length).toBe(flattened.length);
    });
});
