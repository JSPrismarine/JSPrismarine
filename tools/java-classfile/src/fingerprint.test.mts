import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { JavaClass } from './classFile.mts';
import { parseJavaClass } from './classFile.mts';
import { JavaSourceError, javaSourceFingerprint, javaSourceKey, javaSourceListing } from './fingerprint.mts';
import type { JavaSourceMember } from './fingerprint.mts';
import { MNEMONICS, OPCODES, decodeInstructions, instructionLength } from './instructions.mts';

/**
 * `fixtures/v1/Sponge.java` and `fixtures/v2/Sponge.java` differ in two ways: v2 adds a method
 * with a lambda ahead of the others, and changes one constant in the private helper `accepts`.
 */
const fixture = (version: 'v1' | 'v2'): JavaClass =>
    parseJavaClass(readFileSync(join(import.meta.dirname, '..', 'fixtures', version, 'Sponge.class')));

const loader =
    (version: 'v1' | 'v2') =>
    (name: string): JavaClass | undefined =>
        name === 'Sponge' ? fixture(version) : undefined;

const listing = (version: 'v1' | 'v2', member: JavaSourceMember): string[] =>
    javaSourceListing(loader(version), member);

const fingerprint = (version: 'v1' | 'v2', member: JavaSourceMember): string =>
    javaSourceFingerprint(listing(version, member));

const ABSORB = { owner: 'Sponge', name: 'absorb', descriptor: '([I)I' };
const DESCRIBE = { owner: 'Sponge', name: 'describe', descriptor: '(I)Ljava/lang/String;' };
const UNRELATED = { owner: 'Sponge', name: 'unrelated', descriptor: '()I' };

describe('parseJavaClass', () => {
    it('reads the hierarchy, the constant fields and every method', () => {
        const sponge = fixture('v1');

        expect(sponge.name).toBe('Sponge');
        expect(sponge.superName).toBe('java/lang/Object');
        expect(sponge.fields.find((field) => field.name === 'MAX_DEPTH')?.numericValue).toBe(6);
        expect(sponge.methods.map((method) => method.name)).toEqual(
            expect.arrayContaining(['absorb', 'accepts', 'describe', 'overload', '<clinit>'])
        );
        const describeMethod = sponge.methods.find((method) => method.name === 'describe');
        expect(describeMethod?.exceptionTable.map((handler) => handler.catchType)).toEqual([
            'java/lang/IndexOutOfBoundsException'
        ]);
        expect(describeMethod?.parameterNames.get(1)).toBe('block');
    });
});

describe('decodeInstructions', () => {
    it('names every opcode up to jsr_w', () => {
        expect(MNEMONICS).toHaveLength(OPCODES.JSR_W + 1);
        expect(MNEMONICS[OPCODES.INVOKEDYNAMIC]).toBe('invokedynamic');
        expect(MNEMONICS[0x2a]).toBe('aload_0');
    });

    it('refuses a switch whose bounds or length do not fit the code', () => {
        // tableswitch at 0: three padding bytes, a default, then low 0 and high -5.
        const reversed = new Uint8Array([0xaa, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xfb]);
        expect(() => instructionLength(reversed, 0)).toThrow(/below low/);
        // lookupswitch at 0 that claims one pair and stops before it.
        const truncated = new Uint8Array([0xab, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 1]);
        expect(() => instructionLength(truncated, 0)).toThrow(/past the end/);
    });

    it('resolves a switch, a lambda call site and the calls a method makes', () => {
        const sponge = fixture('v1');
        const code = (name: string): Uint8Array => {
            const method = sponge.methods.find((candidate) => candidate.name === name);
            if (method?.code === undefined) throw new Error(`no code for ${name}`);
            return method.code;
        };

        const accepts = decodeInstructions(sponge, code('accepts'));
        const switched = accepts.find((instruction) => instruction.switch !== undefined);
        expect(switched?.switch?.cases.map(([key]) => key)).toEqual([1, 2, 40]);

        const describes = decodeInstructions(sponge, code('describe'));
        const lambda = describes.find((instruction) => instruction.opcode === OPCODES.INVOKEDYNAMIC);
        expect(lambda?.handles).toContain('Sponge.lambda$describe$0');
        expect(lambda?.callSite?.bootstrap).toBe('java/lang/invoke/LambdaMetafactory.metafactory');

        const absorbs = decodeInstructions(sponge, code('absorb'));
        expect(absorbs.map((instruction) => instruction.member).filter(Boolean)).toEqual([
            'Sponge.WET',
            'java/util/function/IntPredicate.test',
            'Sponge.accepts'
        ]);
    });
});

describe('javaSourceListing', () => {
    it('lists a method with the private helper it calls, and targets as instruction indices', () => {
        const lines = listing('v1', ABSORB);

        expect(lines[0]).toBe('method Sponge.absorb([I)I');
        expect(lines).toContain('inlined Sponge.accepts(I)Z');
        expect(lines.some((line) => /: if\w+ L\d+$/.test(line))).toBe(true);
        expect(lines.some((line) => /\b\d{2,}: (?:if|goto)\w* \d/.test(line))).toBe(false);
    });

    it('renames each lambda by the order the listing meets it', () => {
        const lines = listing('v1', DESCRIBE);

        expect(lines).toContain('inlined Sponge.lambda#0(I)Z');
        expect(lines.join('\n')).not.toContain('lambda$');
        expect(lines.some((line) => line.startsWith('  try '))).toBe(true);
    });

    it('lists a constant field by its value, and a static field by the whole static initializer', () => {
        expect(listing('v1', { owner: 'Sponge', name: 'MAX_DEPTH' })).toEqual(['field Sponge.MAX_DEPTH I = int 6']);

        const names = listing('v1', { owner: 'Sponge', name: 'NAMES' });
        expect(names[0]).toBe('field Sponge.NAMES Ljava/util/List;');
        expect(names[1]).toBe('inlined Sponge.<clinit>()V');
        expect(names.join('\n')).toContain('string "water"');
        expect(names.join('\n')).toMatch(/putstatic Sponge\.WET/);

        const wet = listing('v1', { owner: 'Sponge', name: 'WET' });
        expect(wet.slice(1)).toEqual(names.slice(1));
        expect(wet).toContain('inlined Sponge.lambda#0(I)Z');
    });

    it('keeps a long constant past 2^53 exact', () => {
        expect(listing('v1', { owner: 'Sponge', name: 'BIG' })).toEqual(['field Sponge.BIG J = long 9007199254740993']);
    });

    it('marks a synchronized method in its header', () => {
        expect(listing('v1', { owner: 'Sponge', name: 'locked', descriptor: '()I' })[0]).toBe(
            'method Sponge.locked()I synchronized'
        );
        expect(listing('v1', UNRELATED)[0]).toBe('method Sponge.unrelated()I');
    });

    it("names a lambda handle's reference kind", () => {
        expect(listing('v1', DESCRIBE).join('\n')).toContain('handle invokeStatic Sponge.lambda#0(I)Z');
    });

    it('refuses a member the class does not declare', () => {
        expect(() => listing('v1', { owner: 'Sponge', name: 'missing', descriptor: '()V' })).toThrow(JavaSourceError);
        expect(() => listing('v1', { owner: 'Absent', name: 'absorb', descriptor: '()V' })).toThrow(JavaSourceError);
    });
});

describe('javaSourceFingerprint', () => {
    it('changes when a private helper the method calls changes', () => {
        expect(fingerprint('v2', ABSORB)).not.toBe(fingerprint('v1', ABSORB));
    });

    it('stays the same for methods the change does not reach, even with a lambda added to the class', () => {
        expect(fingerprint('v2', DESCRIBE)).toBe(fingerprint('v1', DESCRIBE));
        expect(fingerprint('v2', UNRELATED)).toBe(fingerprint('v1', UNRELATED));
        expect(fingerprint('v2', { owner: 'Sponge', name: 'WET' })).toBe(
            fingerprint('v1', { owner: 'Sponge', name: 'WET' })
        );
    });

    it('is a SHA-256 keyed by owner, name and descriptor', () => {
        expect(fingerprint('v1', UNRELATED)).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(javaSourceKey(ABSORB)).toBe('Sponge.absorb([I)I');
        expect(javaSourceKey({ owner: 'Sponge', name: 'WET' })).toBe('Sponge.WET');
    });
});
