import { describe, expect, it } from 'vitest';

import {
    bedrockCommand,
    bedrockCommandEnum,
    bedrockCommandTable,
    isBedrockBasicType,
    isBedrockSoftEnum
} from './bedrockTable';

describe('the generated Bedrock command table', () => {
    it('measures the counts docs/research/commands-functions-and-datapack-execution.md reports', () => {
        expect(bedrockCommandTable.counts).toEqual({
            commands: 84,
            overloads: 279,
            parameters: 1186,
            enums: 236,
            enumValues: 14281,
            basicTypes: 26,
            softEnums: 4
        });
    });

    it('records the counts the generator measured, not a stale header', () => {
        const overloads = bedrockCommandTable.commands.flatMap((command) => command.overloads);
        const parameters = overloads.flatMap((overload) => overload.parameters);
        const enumValues = bedrockCommandTable.enums.reduce((total, entry) => total + entry.values.length, 0);

        expect(bedrockCommandTable.commands).toHaveLength(bedrockCommandTable.counts.commands);
        expect(overloads).toHaveLength(bedrockCommandTable.counts.overloads);
        expect(parameters).toHaveLength(bedrockCommandTable.counts.parameters);
        expect(bedrockCommandTable.enums).toHaveLength(bedrockCommandTable.counts.enums);
        expect(enumValues).toBe(bedrockCommandTable.counts.enumValues);
    });

    it('is pinned to the bedrock-samples commit the research note measured', () => {
        expect(bedrockCommandTable.source).toEqual({
            repo: 'Mojang/bedrock-samples',
            tag: 'v1.26.50.4',
            commit: '46ba6ea985fb5a92d79a9419198f10dda14c199d',
            path: 'metadata/command_modules/mojang-commands.json'
        });
    });

    it('names the 26 basic parameter types with the use counts the note lists', () => {
        const uses = Object.fromEntries(bedrockCommandTable.basicTypes.map((entry) => [entry.name, entry.uses]));

        expect(uses).toMatchObject({
            SELECTION: 147,
            VAL: 86,
            INT: 84,
            ID: 54,
            POSITION_FLOAT: 52,
            POSITION: 45,
            RVAL: 31,
            EXECUTECHAINEDOPTION_0: 17,
            PATHCOMMAND: 13,
            WILDCARDSELECTION: 9,
            BLOCK_STATE_ARRAY: 8,
            JSON_OBJECT: 7,
            MESSAGE_ROOT: 6,
            WILDCARDINT: 2
        });
        expect(bedrockCommandTable.basicTypes.filter((entry) => entry.uses === 1)).toHaveLength(12);
    });

    it('carries exactly the four soft enums Mojang declares with no values', () => {
        expect(bedrockCommandTable.softEnums).toEqual([
            'GameTestName',
            'GameTestTag',
            'ScoreboardObjectives',
            'TagValues'
        ]);
        expect(bedrockCommandTable.enums.filter((entry) => entry.values.length === 0)).toHaveLength(4);
    });

    it('holds the largest enums the note measured', () => {
        const sizeOf = (name: string) => bedrockCommandEnum(name)?.values.length;

        expect(sizeOf('UnlockableRecipeValues')).toBe(4202);
        expect(sizeOf('Item')).toBe(3411);
        expect(sizeOf('Block')).toBe(2648);
        expect(sizeOf('Tool')).toBe(2079);
        expect(sizeOf('EntityEvents')).toBe(479);
        expect(sizeOf('EntityType')).toBe(229);
    });

    it('resolves an enum through the upper-case name a parameter refers to it by', () => {
        expect(bedrockCommandEnum('SCOREBOARDCRITERIA')?.values).toEqual(['dummy']);
        expect(bedrockCommandEnum('ScoreboardCriteria')?.name).toBe('ScoreboardCriteria');
        expect(isBedrockSoftEnum('TAGVALUES')).toBe(true);
        expect(isBedrockSoftEnum('SCOREBOARDCRITERIA')).toBe(false);
        expect(isBedrockBasicType('SELECTION')).toBe(true);
        expect(isBedrockBasicType('SCOREBOARDCRITERIA')).toBe(false);
    });

    it('resolves every parameter type to either a command enum or a basic type', () => {
        for (const command of bedrockCommandTable.commands) {
            for (const overload of command.overloads) {
                for (const parameter of overload.parameters) {
                    expect(bedrockCommandEnum(parameter.type) !== undefined || isBedrockBasicType(parameter.type)).toBe(
                        true
                    );
                }
            }
        }
    });

    it('has /execute as 18 overloads at permission level 1, requiring cheats', () => {
        const execute = bedrockCommand('execute');

        expect(execute?.overloads).toHaveLength(18);
        expect(execute?.permissionLevel).toBe(1);
        expect(execute?.requiresCheats).toBe(true);
    });

    it('has no /team and no /bossbar, which Bedrock does not implement', () => {
        expect(bedrockCommand('team')).toBeUndefined();
        expect(bedrockCommand('bossbar')).toBeUndefined();
    });
});
