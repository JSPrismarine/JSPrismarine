import { BlockStateModel, vanillaBlockPalette } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { BlockStateSchemas, schemaFromModel } from './BlockStateSchema';

describe('BlockStateSchema', () => {
    it('writes a bit as an NBT byte and keeps ints and strings as they are', () => {
        const schema = schemaFromModel(
            'test:block',
            new BlockStateModel([
                { name: 'lit', type: 'bool', values: [false, true], defaultValue: true },
                { name: 'age', type: 'int', values: [0, 1, 2], defaultValue: 0 },
                { name: 'facing', type: 'string', values: ['north', 'south'], defaultValue: 'south' }
            ])
        );

        expect(schema.properties).toEqual({
            age: { type: 'int', values: [0, 1, 2], default: 0 },
            facing: { type: 'string', values: ['north', 'south'], default: 'south' },
            lit: { type: 'byte', values: [0, 1], default: 1 }
        });
    });

    it('ships one schema per block of the vanilla palette, with the same states', () => {
        const palette = vanillaBlockPalette();

        expect(BlockStateSchemas.names().sort()).toEqual(palette.entries.map(({ identifier }) => identifier).sort());
        for (const { identifier, model } of palette.entries) {
            expect(BlockStateSchemas.get(identifier)?.getAllStates()).toHaveLength(model.size);
        }
    });
});
