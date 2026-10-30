import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CommandArgumentType, CommandParameterType, CommandParameterTypeFlag } from './CommandParameter';

/**
 * The ids `@jsprismarine/commands` verified against Mojang's own 1.26.50.4 command metadata,
 * read out of its source rather than imported: this package does not depend on that one, and
 * the point of the check is that the two tables cannot drift apart.
 */
const commandsPackageTypeIds = (): Map<string, number> => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../../../../commands/src/parameterTypes.ts');
    const source = readFileSync(path, 'utf8');
    const body = /export const BedrockParameterTypeId = \{([^}]*)\} as const;/.exec(source)?.[1];
    if (body === undefined) throw new Error(`no BedrockParameterTypeId in ${path}`);

    const ids = new Map<string, number>();
    for (const [, name, id] of body.matchAll(/(\w+):\s*(\d+)/g)) {
        if (name !== undefined && id !== undefined) ids.set(name, Number(id));
    }
    return ids;
};

// The numbers gophertunnel's `protocol/command.go` gives at protocol 2193, written out so a
// change to the enum has to be a change here too.
describe('CommandParameter', () => {
    it('carries the protocol 2193 flag bits', () => {
        expect(CommandParameterTypeFlag.Valid).toBe(0x100000);
        expect(CommandParameterTypeFlag.Enum).toBe(0x200000);
        expect(CommandParameterTypeFlag.Postfix).toBe(0x1000000);
        expect(CommandParameterTypeFlag.SoftEnum).toBe(0x4000000);
    });

    it('carries the protocol 2193 argument type ids', () => {
        expect(CommandArgumentType).toMatchObject({
            Int: 1,
            Float: 3,
            Value: 4,
            WildcardInt: 5,
            Operator: 6,
            CompareOperator: 7,
            Target: 8,
            WildcardSelection: 10,
            PathCommand: 17,
            FullIntegerRange: 23,
            EquipmentSlot: 47,
            String: 56,
            BlockPosition: 64,
            Position: 65,
            Message: 67,
            MessageRoot: 68,
            RawText: 70,
            Json: 74,
            BlockStateArray: 84,
            ClockTimeMarker: 86,
            PoiTag: 87,
            PoiType: 88,
            CodeBuilderArgs: 92
        });
    });

    it('holds every id the commands package verified against Mojang metadata', () => {
        // A numeric TypeScript enum also maps each number back to its name, so only the
        // numbers are ids.
        const ids = Object.values(CommandArgumentType).filter((value) => typeof value === 'number');
        const missing = [...commandsPackageTypeIds()].filter(([, id]) => !ids.includes(id));

        expect(missing).toEqual([]);
    });

    it('builds every parameter type word from its id and the valid flag', () => {
        expect(CommandParameterType.Int).toBe(0x100000 | 1);
        expect(CommandParameterType.Target).toBe(0x100000 | 8);
        expect(CommandParameterType.String).toBe(0x100000 | 56);
        expect(CommandParameterType.Position).toBe(0x100000 | 65);
        expect(CommandParameterType.Message).toBe(0x100000 | 67);
        expect(CommandParameterType.MessageRoot).toBe(0x100000 | 68);
        expect(CommandParameterType.RawText).toBe(0x100000 | 70);
        expect(CommandParameterType.Json).toBe(0x100000 | 74);
        expect(CommandParameterType.BlockStateArray).toBe(0x100000 | 84);
        expect(CommandParameterType.PoiTag).toBe(0x100000 | 87);
        expect(CommandParameterType.CodeBuilderArgs).toBe(0x100000 | 92);
        expect(CommandParameterType.Enum).toBe(0x200000);
    });
});
