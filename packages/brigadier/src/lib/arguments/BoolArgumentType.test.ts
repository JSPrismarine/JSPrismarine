import { assert, expect, describe, beforeEach, it } from 'vitest';
import { mock, instance, when, verify } from 'ts-mockito';
import { DefaultType } from '../arguments/ArgumentType';
import StringReader from '../StringReader';

describe('BoolArgumentTypeTest', () => {
    const type = DefaultType.bool();

    it('parse', () => {
        const mockedReader = mock(StringReader);
        when(mockedReader.readBoolean()).thenReturn(true);

        const reader = instance(mockedReader);
        assert.equal(type.parse(reader), true);

        verify(mockedReader.readBoolean()).once();
    });
});
