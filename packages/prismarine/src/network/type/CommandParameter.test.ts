import { describe, expect, it } from 'vitest';

import { CommandArgumentType, CommandParameterType, CommandParameterTypeFlag } from './CommandParameter';

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
            String: 56,
            BlockPosition: 64,
            Position: 65,
            Message: 67,
            RawText: 70,
            Json: 74,
            Command: 87
        });
    });

    it('builds every parameter type word from its id and the valid flag', () => {
        expect(CommandParameterType.Int).toBe(0x100000 | 1);
        expect(CommandParameterType.Target).toBe(0x100000 | 8);
        expect(CommandParameterType.String).toBe(0x100000 | 56);
        expect(CommandParameterType.Position).toBe(0x100000 | 65);
        expect(CommandParameterType.Message).toBe(0x100000 | 67);
        expect(CommandParameterType.RawText).toBe(0x100000 | 70);
        expect(CommandParameterType.Json).toBe(0x100000 | 74);
        expect(CommandParameterType.Command).toBe(0x100000 | 87);
        expect(CommandParameterType.Enum).toBe(0x200000);
    });
});
