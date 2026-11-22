import { inspect } from 'node:util';

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CommonErrors } from './common';
import {
    codeAnchor,
    constantCase,
    isJSPrismarineError,
    JSPrismarineError,
    JSPrismarineRangeError,
    JSPrismarineReferenceError,
    JSPrismarineTypeError
} from './JSPrismarineError';
import { CorruptionError, LeveldbErrors } from './leveldb';
import { LoggedFieldError, PrismarineEntityErrors } from './prismarine/entity';
import { PrismarineWorldErrors } from './prismarine/world';
import { ScriptHostErrors } from './script-host';

describe('a generated catalog error', () => {
    it('fills placeholders the way a template literal does', () => {
        const error = new LeveldbErrors.UnreadableBlockCompression({ offset: 'CURRENT', type: 17 });
        expect(error.message).toBe('Block at offset CURRENT has compression type 17');
        expect(error.params).toEqual({ offset: 'CURRENT', type: 17 });
    });

    it('prefixes the code with the domain', () => {
        expect(new LeveldbErrors.LogAppendInProgress().code).toBe('LEVELDB_LOG_APPEND_IN_PROGRESS');
        expect(LeveldbErrors.BlockCacheSizeMustBeNonNegative.code).toBe(
            'LEVELDB_BLOCK_CACHE_SIZE_MUST_BE_NON_NEGATIVE'
        );
    });

    it('links to the entry in the error reference', () => {
        expect(new LeveldbErrors.LogAppendInProgress().docs).toBe(
            'https://jsprismarine.dev/errors/leveldb#leveldb-log-append-in-progress'
        );
    });

    it("links a module's errors to the module's page, with the domain's code", () => {
        const { code, domain, module } = PrismarineWorldErrors.AirNotRegistered;
        expect({ code, domain, module }).toEqual({
            code: 'PRISMARINE_AIR_NOT_REGISTERED',
            domain: 'prismarine',
            module: 'world'
        });
        expect(new PrismarineWorldErrors.AirNotRegistered().docs).toBe(
            'https://jsprismarine.dev/errors/prismarine/world#prismarine-air-not-registered'
        );
        expect('module' in LeveldbErrors.LogAppendInProgress).toBe(false);
    });

    it('passes the cause through, with or without placeholders', () => {
        const cause = new Error('underneath');
        expect(new LeveldbErrors.LogAppendInProgress({ cause }).cause).toBe(cause);
        expect(new LeveldbErrors.UnreadableBlockCompression({ offset: 1, type: 2 }, { cause }).cause).toBe(cause);
    });

    it('is named after its key and keeps the name of the error it extends', () => {
        expect(LeveldbErrors.LogAppendInProgress.name).toBe('LogAppendInProgress');
        expect(new LeveldbErrors.LogAppendInProgress().name).toBe('Error');
        expect(new LeveldbErrors.BlockCacheSizeMustBeNonNegative({ byteBudget: -1 }).name).toBe('RangeError');
        expect(new LeveldbErrors.UnreadableBlockCompression({ offset: 1, type: 2 }).name).toBe('CorruptionError');
    });

    it('extends the root of the built-in error it is based on', () => {
        const range = new LeveldbErrors.BlockCacheSizeMustBeNonNegative({ byteBudget: -1 });
        expect(range).toBeInstanceOf(LeveldbErrors.BlockCacheSizeMustBeNonNegative);
        expect(range).toBeInstanceOf(JSPrismarineRangeError);
        expect(range).toBeInstanceOf(RangeError);
        expect(range).not.toBeInstanceOf(JSPrismarineError);

        const reference = new ScriptHostErrors.UnknownHostFunction({ id: 3 });
        expect(reference).toBeInstanceOf(JSPrismarineReferenceError);
        expect(reference).toBeInstanceOf(ReferenceError);

        expect(new LeveldbErrors.LogAppendInProgress()).toBeInstanceOf(JSPrismarineError);
        expect(new LeveldbErrors.LogAppendInProgress()).not.toBeInstanceOf(LeveldbErrors.UnreadableBlockCompression);
    });

    it('extends a category', () => {
        const error = new LeveldbErrors.UnreadableBlockCompression({ offset: 1, type: 2 });
        expect(error).toBeInstanceOf(CorruptionError);
        expect(error).toBeInstanceOf(JSPrismarineError);
        expect(new LeveldbErrors.LogAppendInProgress()).not.toBeInstanceOf(CorruptionError);

        const logged = new PrismarineEntityErrors.InvalidLoggedField({ field: 'a', value: 'b' });
        expect(logged).toBeInstanceOf(LoggedFieldError);
        expect(logged).toBeInstanceOf(JSPrismarineTypeError);
        expect(logged).toBeInstanceOf(TypeError);
    });

    it('shows the code and the docs link when inspected, and keeps the params out', () => {
        const printed = inspect(new LeveldbErrors.UnreadableBlockCompression({ offset: 'a', type: 'b' }));
        expect(printed).toContain("code: 'LEVELDB_UNREADABLE_BLOCK_COMPRESSION'");
        expect(printed).toContain('https://jsprismarine.dev/errors/leveldb#leveldb-unreadable-block-compression');
        expect(printed).not.toContain('params');
        expect(printed).not.toContain('cataloged');
    });

    it('types the constructor from the template', () => {
        expectTypeOf(LeveldbErrors.LogAppendInProgress).constructorParameters.toEqualTypeOf<[options?: ErrorOptions]>();
        expectTypeOf(LeveldbErrors.UnreadableBlockCompression).constructorParameters.toEqualTypeOf<
            [params: { readonly offset: unknown; readonly type: unknown }, options?: ErrorOptions]
        >();
        expectTypeOf(new LeveldbErrors.BlockCacheSizeMustBeNonNegative({ byteBudget: 1 })).toExtend<RangeError>();
        // @ts-expect-error: the template has a `type` placeholder.
        new LeveldbErrors.UnreadableBlockCompression({ offset: 1 });
    });

    it('lets params be read by any key, as a record', () => {
        const error = new LeveldbErrors.UnreadableBlockCompression({ offset: 1, type: 2 });
        expectTypeOf(error.params.offset).toBeUnknown();
        expect(Object.keys(error.params).map((key) => error.params[key])).toEqual([1, 2]);
    });

    it('reads a missing params argument from JavaScript as no values', () => {
        const cause = new Error('underneath');
        for (const missing of [undefined, null]) {
            // Reflect.construct takes its arguments untyped, the way a JavaScript caller passes them.
            const error: unknown = Reflect.construct(PrismarineEntityErrors.InvalidSavedGameMode, [missing, { cause }]);
            expect(error).toBeInstanceOf(PrismarineEntityErrors.InvalidSavedGameMode);
            expect(error).toMatchObject({
                message: 'abilities.gamemode cannot hold undefined',
                code: 'PRISMARINE_INVALID_SAVED_GAME_MODE',
                params: { value: undefined },
                cause
            });
        }
    });
});

describe('isJSPrismarineError', () => {
    it('holds for a catalog error whichever built-in error it extends', () => {
        expect(isJSPrismarineError(new LeveldbErrors.LogAppendInProgress())).toBe(true);
        expect(isJSPrismarineError(new LeveldbErrors.BlockCacheSizeMustBeNonNegative({ byteBudget: -1 }))).toBe(true);
        expect(isJSPrismarineError(new PrismarineEntityErrors.InvalidLoggedField({ field: 'a', value: 'b' }))).toBe(
            true
        );
        expect(isJSPrismarineError(new ScriptHostErrors.UnknownHostFunction({ id: 3 }))).toBe(true);
        expect(isJSPrismarineError(new CommonErrors.ThrownValue({ value: 'x' }))).toBe(true);
    });

    it('holds for an error that another copy of the package built', async () => {
        vi.resetModules();
        const copy = await import('./leveldb');
        const error = new copy.LeveldbErrors.BlockCacheSizeMustBeNonNegative({ byteBudget: -1 });
        expect(error).not.toBeInstanceOf(JSPrismarineRangeError);
        expect(isJSPrismarineError(error)).toBe(true);
    });

    it('does not hold for a subclass of a category that has no code, docs or params', () => {
        // @ts-expect-error: a concrete subclass of a category must set code, docs and params.
        class PluginFieldError extends LoggedFieldError {}
        const error = new PluginFieldError('bad field');
        expect(error).toBeInstanceOf(JSPrismarineTypeError);
        expect(isJSPrismarineError(error)).toBe(false);
    });

    it('does not hold for a plain error or another value', () => {
        expect(isJSPrismarineError(new Error('x'))).toBe(false);
        expect(isJSPrismarineError(new RangeError('x'))).toBe(false);
        expect(isJSPrismarineError('x')).toBe(false);
        expect(new Error('x')).not.toBeInstanceOf(JSPrismarineError);
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
