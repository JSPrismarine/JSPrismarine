import { flattenCommandTree } from '@jsprismarine/commands/flatten';
import type { CommandSource } from '@jsprismarine/commands/host';
import { createCommandSource } from '@jsprismarine/commands/host';
import { testCommandHost, testEntity } from '@jsprismarine/commands/testing';
import { CommandRegistry } from '@jsprismarine/commands/tree';
import type {
    ScriptCommandArgument,
    ScriptCommandOrigin,
    ScriptCommandOutcome,
    ScriptCommandSet
} from '@jsprismarine/script-host/host/world';
import { describe, expect, it } from 'vitest';

import { registerScriptCommands, SCRIPT_COMMAND_FAILED } from './scriptCommands';

/** A command set whose callback records each run and answers `outcome`. */
const commandSet = (outcome: ScriptCommandOutcome = { status: 'success', message: 'done' }) => {
    const runs: { name: string; origin: ScriptCommandOrigin; args: readonly ScriptCommandArgument[] }[] = [];
    const set: ScriptCommandSet = {
        enums: [{ name: 'jsp:color', values: ['red', 'green'] }],
        commands: [
            {
                name: 'jsp:types',
                description: 'Takes one of each type',
                permissionLevel: 0,
                cheatsRequired: true,
                mandatoryParameters: [
                    { name: 'text', type: 'String' },
                    { name: 'count', type: 'Integer' },
                    { name: 'ratio', type: 'Float' },
                    { name: 'flag', type: 'Boolean' },
                    { name: 'where', type: 'Location' }
                ],
                optionalParameters: [{ name: 'jsp:color', type: 'Enum' }]
            },
            {
                name: 'jsp:admin',
                description: 'Needs admin',
                permissionLevel: 2,
                cheatsRequired: false,
                mandatoryParameters: [],
                optionalParameters: [{ name: 'who', type: 'EntitySelector' }]
            }
        ],
        run: (name, origin, args) => {
            runs.push({ name, origin, args });
            return outcome;
        }
    };
    return { set, runs };
};

const sourceWith = (
    level: number,
    messages: string[],
    entity = testEntity({ id: '7', type: 'minecraft:player', isPlayer: true })
): CommandSource =>
    createCommandSource({
        host: testCommandHost({ entities: { select: () => [entity] } }),
        permissionLevel: level,
        onFeedback: (message) => messages.push(`feedback ${message}`),
        onError: (message) => messages.push(`error ${message}`)
    });

describe('registerScriptCommands', () => {
    it('parses each parameter as BDS does and hands the callback its values', () => {
        const registry = new CommandRegistry<CommandSource>();
        const { set, runs } = commandSet();
        registerScriptCommands(registry, set);
        const messages: string[] = [];
        const dispatcher = registry.getDispatcher();
        dispatcher.execute('jsp:types "two words" -3 2.5 true 1 2 3 purple', sourceWith(0, messages));
        dispatcher.execute('types word 7 1 false ~1 ~ ~-1', sourceWith(0, messages));
        expect(runs.map((run) => run.args)).toEqual([
            // An absolute whole x or z names the middle of its block; BDS took a word the enum lacks.
            ['two words', -3, 2.5, true, { kind: 'location', location: { x: 1.5, y: 2, z: 3.5 } }, 'purple'],
            ['word', 7, 1, false, { kind: 'location', location: { x: 1, y: 0, z: -1 } }]
        ]);
        expect(runs[0]?.origin).toEqual({ sourceType: 'Server' });
        expect(messages).toEqual(['feedback done', 'feedback done']);
    });

    it('gives the command its metadata and lists it with its enum for clients', () => {
        const registry = new CommandRegistry<CommandSource>();
        registerScriptCommands(registry, commandSet().set);
        expect(registry.getMetadata('jsp:types')).toMatchObject({
            description: 'Takes one of each type',
            aliases: ['types'],
            permissionLevel: 0,
            requiresCheats: true
        });
        const listed = flattenCommandTree(registry).commands.find((command) => command.name === 'jsp:types');
        const color = listed?.overloads.at(-1)?.parameters.at(-1);
        expect(color?.shape).toEqual({ kind: 'enum', name: 'jsp:color', values: ['red', 'green'] });
    });

    it('runs nothing for a sender below its level, and fails without a number', () => {
        const registry = new CommandRegistry<CommandSource>();
        const { set, runs } = commandSet({ status: 'failure', message: 'it failed' });
        registerScriptCommands(registry, set);
        const messages: string[] = [];
        expect(registry.getDispatcher().execute('jsp:admin', sourceWith(1, messages))).toEqual([SCRIPT_COMMAND_FAILED]);
        expect(runs).toEqual([]);
        expect(registry.getDispatcher().execute('jsp:admin @a', sourceWith(2, messages))).toEqual([
            SCRIPT_COMMAND_FAILED
        ]);
        expect(runs[0]?.args).toEqual([{ kind: 'entities', entities: [{ id: '7', typeId: 'minecraft:player' }] }]);
        expect(messages).toEqual(['error it failed']);
    });

    it('leaves the bare name to a command that already holds it', () => {
        const registry = new CommandRegistry<CommandSource>();
        registerScriptCommands(registry, commandSet().set);
        registerScriptCommands(registry, {
            ...commandSet().set,
            enums: [{ name: 'jsp:color', values: ['red'] }],
            commands: [{ ...commandSet().set.commands[0]!, name: 'other:types' }]
        });
        expect(registry.getAliasOwner('types')).toBe('jsp:types');
        expect(registry.getMetadata('other:types')?.aliases).toEqual([]);
    });
});
