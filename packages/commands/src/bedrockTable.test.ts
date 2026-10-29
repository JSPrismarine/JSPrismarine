import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../.test/reportProgress';

import {
    bedrockCommand,
    bedrockCommandEnum,
    bedrockCommandTable,
    isBedrockBasicType,
    isBedrockSoftEnum
} from './bedrockTable';

describe('the generated Bedrock command table', () => {
    it('keeps generated summary fields aligned with the table contents', () => {
        const overloads = bedrockCommandTable.commands.flatMap((command) => command.overloads);
        const parameters = overloads.flatMap((overload) => overload.parameters);
        const enumValues = bedrockCommandTable.enums.reduce((total, entry) => total + entry.values.length, 0);

        expect(bedrockCommandTable.commands).toHaveLength(bedrockCommandTable.counts.commands);
        expect(overloads).toHaveLength(bedrockCommandTable.counts.overloads);
        expect(parameters).toHaveLength(bedrockCommandTable.counts.parameters);
        expect(bedrockCommandTable.enums).toHaveLength(bedrockCommandTable.counts.enums);
        expect(enumValues).toBe(bedrockCommandTable.counts.enumValues);
        const largestEnums = bedrockCommandTable.enums
            .toSorted((left, right) => right.values.length - left.values.length)
            .slice(0, 6)
            .map(({ name, values }) => `${name}=${values.length}`);
        reportProgress(
            `Bedrock command data: ${bedrockCommandTable.counts.commands} commands, ${bedrockCommandTable.counts.overloads} overloads, ${bedrockCommandTable.counts.parameters} parameters, ${bedrockCommandTable.counts.enums} enums, ${bedrockCommandTable.counts.enumValues} enum values, ${bedrockCommandTable.counts.basicTypes} basic types, and ${bedrockCommandTable.counts.softEnums} soft enums. Largest enums: ${largestEnums.join(', ')}.`
        );
    });

    it('is pinned to the bedrock-samples commit used to generate this table', () => {
        expect(bedrockCommandTable.source).toEqual({
            repo: 'Mojang/bedrock-samples',
            tag: 'v1.26.50.4',
            commit: '46ba6ea985fb5a92d79a9419198f10dda14c199d',
            path: 'metadata/command_modules/mojang-commands.json'
        });
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

    it('/execute requires permission level 1 and cheats', () => {
        const execute = bedrockCommand('execute');

        expect(execute?.permissionLevel).toBe(1);
        expect(execute?.requiresCheats).toBe(true);
    });

    it('has no /team and no /bossbar, which Bedrock does not implement', () => {
        expect(bedrockCommand('team')).toBeUndefined();
        expect(bedrockCommand('bossbar')).toBeUndefined();
    });
});
