import { describe, expect, expectTypeOf, it } from 'vitest';
import { codeAnchor, constantCase, defineErrors, JSPrismarineError } from './JSPrismarineError';

abstract class TestCategoryError extends JSPrismarineError {
    public override name = 'TestCategoryError';
}

const TestErrors = defineErrors('test-domain', {
    Plain: 'Nothing to fill in',
    Filled: 'Corruption in {file}: {reason}',
    OutOfRange: { message: 'Offset {offset} is out of range', base: RangeError },
    Categorized: { message: 'Bad {thing}', base: TestCategoryError }
});

describe('defineErrors', () => {
    it('fills placeholders the way a template literal does', () => {
        const error = new TestErrors.Filled({ file: 'CURRENT', reason: 17 });
        expect(error.message).toBe('Corruption in CURRENT: 17');
        expect(error.params).toEqual({ file: 'CURRENT', reason: 17 });
    });

    it('prefixes the code with the domain', () => {
        expect(new TestErrors.Plain().code).toBe('TEST_DOMAIN_PLAIN');
        expect(TestErrors.OutOfRange.code).toBe('TEST_DOMAIN_OUT_OF_RANGE');
    });

    it('links to the entry in the error reference', () => {
        expect(new TestErrors.Plain().docs).toBe('https://jsprismarine.dev/errors/test-domain.html#test-domain-plain');
    });

    it('passes the cause through, with or without placeholders', () => {
        const cause = new Error('underneath');
        expect(new TestErrors.Plain({ cause }).cause).toBe(cause);
        expect(new TestErrors.Filled({ file: 'a', reason: 'b' }, { cause }).cause).toBe(cause);
    });

    it('keeps the base class and the catalog root in the prototype chain', () => {
        const error = new TestErrors.OutOfRange({ offset: 3 });
        expect(error).toBeInstanceOf(TestErrors.OutOfRange);
        expect(error).toBeInstanceOf(RangeError);
        expect(error).toBeInstanceOf(JSPrismarineError);
        expect(error.name).toBe('RangeError');
        expect(new TestErrors.Plain()).not.toBeInstanceOf(TestErrors.Filled);
    });

    it('extends a category', () => {
        const error = new TestErrors.Categorized({ thing: 'input' });
        expect(error).toBeInstanceOf(TestCategoryError);
        expect(error).toBeInstanceOf(JSPrismarineError);
        expect(error.name).toBe('TestCategoryError');
        expect(new TestErrors.Plain()).not.toBeInstanceOf(TestCategoryError);
    });

    it('does not count a plain error as cataloged', () => {
        expect(new Error('x')).not.toBeInstanceOf(JSPrismarineError);
        expect('x').not.toBeInstanceOf(JSPrismarineError);
    });

    it('shows the code and the docs link when inspected, and keeps the params out', async () => {
        const { inspect } = await import('node:util');
        const printed = inspect(new TestErrors.Filled({ file: 'a', reason: 'b' }));
        expect(printed).toContain("code: 'TEST_DOMAIN_FILLED'");
        expect(printed).toContain('https://jsprismarine.dev/errors/test-domain.html#test-domain-filled');
        expect(printed).not.toContain('params');
    });

    it('types the constructor from the template', () => {
        expectTypeOf(TestErrors.Plain).constructorParameters.toEqualTypeOf<[options?: ErrorOptions]>();
        expectTypeOf(TestErrors.Filled).constructorParameters.toEqualTypeOf<
            [params: { readonly file: unknown; readonly reason: unknown }, options?: ErrorOptions]
        >();
        expectTypeOf(new TestErrors.OutOfRange({ offset: 1 })).toExtend<RangeError>();
        // @ts-expect-error: the template has a `reason` placeholder.
        new TestErrors.Filled({ file: 'a' });
    });
});

describe('constantCase', () => {
    it('reads PascalCase keys and kebab-case domains', () => {
        expect(constantCase('CannotAddToFinishedBlock')).toBe('CANNOT_ADD_TO_FINISHED_BLOCK');
        expect(constantCase('native-network')).toBe('NATIVE_NETWORK');
        expect(constantCase('Utf8Decode')).toBe('UTF8_DECODE');
    });
});

describe('codeAnchor', () => {
    it('matches the slug VitePress gives a heading of the code', () => {
        expect(codeAnchor('LEVELDB_CORRUPTION')).toBe('leveldb-corruption');
    });
});
