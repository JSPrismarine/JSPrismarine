import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { readServerJar } from './javaDatapack.ts';
import { FETCH_CACHE, REFERENCES } from './references.ts';

/**
 * Reads a Java class's hierarchy and the instructions of each method out of the pinned server jar.
 *
 * Some Java rules live only in code, such as the checks a packet handler makes before it acts
 * on a block position, or whether a mob can be leashed. A row that compares against one reads the
 * class file, so a Java version that changes the rule fails the row instead of leaving a comment
 * that no longer says what Java does. Nothing here runs the class; it is parsed as data.
 */

/** One decoded instruction of a method's code. */
export interface JavaInstruction {
    /** The instruction's offset in the method's code. */
    readonly pc: number;
    readonly opcode: number;
    /**
     * The constant the instruction pushes: an `iconst`, `bipush`, `sipush` or `ldc` value, a
     * string for an `ldc` of a string.
     */
    readonly constant?: number | string;
    /** The member an `invoke*` or field instruction names, as `owner/Binary/Name.member`. */
    readonly member?: string;
    /** The member's descriptor, for an `invoke*` or field instruction. */
    readonly descriptor?: string;
    /** The class a `new`, `checkcast` or `instanceof` names, as a binary name. */
    readonly type?: string;
    /** Where a branch jumps, as a code offset. */
    readonly target?: number;
    /** For an `invokedynamic`, the method handles its bootstrap arguments name, as `owner/Binary/Name.member`. */
    readonly handles?: readonly string[];
}

/** One method of a class and the methods its code calls. */
export interface JavaMethod {
    readonly name: string;
    readonly descriptor: string;
    /** `Owner.name` of each `invoke*` instruction but `invokedynamic`, in the order they appear. */
    readonly calls: readonly string[];
    /** The method's code, decoded; empty for an abstract or native method. */
    readonly instructions: readonly JavaInstruction[];
}

/** A class's place in the hierarchy and its methods. */
export interface JavaClass {
    /** The binary name, such as `net/minecraft/world/entity/Mob`. */
    readonly name: string;
    /** The superclass's binary name, absent for `java/lang/Object`. */
    readonly superName?: string;
    readonly interfaces: readonly string[];
    readonly methods: readonly JavaMethod[];
    /**
     * The numeric `static final` constants, by field name: the values `javac` writes as a field's
     * `ConstantValue` attribute, such as `Sniffer.SNIFFER_BABY_START_AGE`.
     */
    readonly constants: ReadonlyMap<string, number>;
}

/** The constant pool entries this reader resolves; every other kind is skipped by its size. */
type PoolEntry =
    | { readonly kind: 'utf8'; readonly text: string }
    | { readonly kind: 'class'; readonly name: number }
    | { readonly kind: 'string'; readonly text: number }
    | { readonly kind: 'number'; readonly value: number }
    | { readonly kind: 'member'; readonly owner: number; readonly nameAndType: number }
    | { readonly kind: 'nameAndType'; readonly name: number; readonly descriptor: number }
    | { readonly kind: 'handle'; readonly reference: number }
    | { readonly kind: 'dynamic'; readonly bootstrap: number; readonly nameAndType: number }
    | { readonly kind: 'other' };

/** Bytes after the tag of each fixed-size constant pool kind, by tag (JVMS 4.4). */
const POOL_ENTRY_SIZE: ReadonlyMap<number, number> = new Map([
    [3, 4],
    [4, 4],
    [5, 8],
    [6, 8],
    [7, 2],
    [8, 2],
    [9, 4],
    [10, 4],
    [11, 4],
    [12, 4],
    [15, 3],
    [16, 2],
    [17, 4],
    [18, 4],
    [19, 2],
    [20, 2]
]);

/** Operand bytes after each opcode whose length is fixed and not zero (JVMS 6.5). */
const OPERAND_SIZE: ReadonlyMap<number, number> = (() => {
    const sizes = new Map<number, number>([
        [0x10, 1],
        [0x11, 2],
        [0x12, 1],
        [0x13, 2],
        [0x14, 2],
        [0x84, 2],
        [0xa9, 1],
        [0xb9, 4],
        [0xba, 4],
        [0xbb, 2],
        [0xbc, 1],
        [0xbd, 2],
        [0xc0, 2],
        [0xc1, 2],
        [0xc5, 3],
        [0xc6, 2],
        [0xc7, 2],
        [0xc8, 4],
        [0xc9, 4]
    ]);
    // Local variable loads and stores take an index byte.
    for (let opcode = 0x15; opcode <= 0x19; opcode++) sizes.set(opcode, 1);
    for (let opcode = 0x36; opcode <= 0x3a; opcode++) sizes.set(opcode, 1);
    // The conditional branches, goto and jsr take a two-byte offset.
    for (let opcode = 0x99; opcode <= 0xa8; opcode++) sizes.set(opcode, 2);
    // Field accesses and invokevirtual, invokespecial and invokestatic take a pool index.
    for (let opcode = 0xb2; opcode <= 0xb8; opcode++) sizes.set(opcode, 2);
    return sizes;
})();

/** Opcodes this reader names, for the instruction matchers the parity rows write (JVMS 6.5). */
export const OPCODES = {
    ICONST_M1: 0x02,
    ICONST_0: 0x03,
    ICONST_5: 0x08,
    BIPUSH: 0x10,
    SIPUSH: 0x11,
    LDC: 0x12,
    LDC_W: 0x13,
    LDC2_W: 0x14,
    ALOAD_0: 0x2a,
    IFEQ: 0x99,
    IFNE: 0x9a,
    IF_ICMPEQ: 0x9f,
    IF_ICMPNE: 0xa0,
    IF_ICMPLT: 0xa1,
    IF_ICMPGE: 0xa2,
    IF_ICMPGT: 0xa3,
    IF_ICMPLE: 0xa4,
    GOTO: 0xa7,
    IRETURN: 0xac,
    DRETURN: 0xaf,
    GETFIELD: 0xb4,
    INVOKEVIRTUAL: 0xb6,
    INVOKESPECIAL: 0xb7,
    INVOKESTATIC: 0xb8,
    INVOKEINTERFACE: 0xb9,
    INVOKEDYNAMIC: 0xba,
    NEW: 0xbb,
    CHECKCAST: 0xc0,
    INSTANCEOF: 0xc1
} as const;

/** The value each `lconst`, `fconst` and `dconst` shorthand pushes (JVMS 6.5). */
const WIDE_SHORTHAND_CONSTANTS: ReadonlyMap<number, number> = new Map([
    [0x09, 0],
    [0x0a, 1],
    [0x0b, 0],
    [0x0c, 1],
    [0x0d, 2],
    [0x0e, 0],
    [0x0f, 1]
]);

const TABLESWITCH = 0xaa;
const LOOKUPSWITCH = 0xab;
const WIDE = 0xc4;
const IINC = 0x84;

/** The simple name of a member reference, `Owner.member`, as {@link JavaMethod.calls} lists it. */
const simpleMember = (member: string): string => member.slice(member.lastIndexOf('/') + 1);

/**
 * Parses a class file: its hierarchy, and each method's decoded code.
 *
 * @param bytes - The `.class` file.
 * @throws {Error} When the bytes are not a class file.
 */
export const javaClass = (bytes: Uint8Array): JavaClass => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== 0xcafebabe) throw new Error('not a Java class file');

    const decoder = new TextDecoder();
    const pool: PoolEntry[] = [{ kind: 'other' }];
    const poolCount = view.getUint16(8);
    let cursor = 10;
    while (pool.length < poolCount) {
        const tag = view.getUint8(cursor);
        cursor += 1;
        if (tag === 1) {
            const length = view.getUint16(cursor);
            pool.push({ kind: 'utf8', text: decoder.decode(bytes.subarray(cursor + 2, cursor + 2 + length)) });
            cursor += 2 + length;
            continue;
        }
        const size = POOL_ENTRY_SIZE.get(tag);
        if (size === undefined) throw new Error(`unknown constant pool tag ${tag}`);
        if (tag === 7) pool.push({ kind: 'class', name: view.getUint16(cursor) });
        else if (tag === 8) pool.push({ kind: 'string', text: view.getUint16(cursor) });
        else if (tag === 3) pool.push({ kind: 'number', value: view.getInt32(cursor) });
        else if (tag === 4) pool.push({ kind: 'number', value: view.getFloat32(cursor) });
        else if (tag === 5) pool.push({ kind: 'number', value: Number(view.getBigInt64(cursor)) });
        else if (tag === 6) pool.push({ kind: 'number', value: view.getFloat64(cursor) });
        else if (tag === 9 || tag === 10 || tag === 11) {
            pool.push({ kind: 'member', owner: view.getUint16(cursor), nameAndType: view.getUint16(cursor + 2) });
        } else if (tag === 12) {
            pool.push({ kind: 'nameAndType', name: view.getUint16(cursor), descriptor: view.getUint16(cursor + 2) });
        } else if (tag === 15) pool.push({ kind: 'handle', reference: view.getUint16(cursor + 1) });
        else if (tag === 17 || tag === 18) {
            pool.push({ kind: 'dynamic', bootstrap: view.getUint16(cursor), nameAndType: view.getUint16(cursor + 2) });
        } else pool.push({ kind: 'other' });
        // A long or a double takes two slots, the second unusable.
        if (tag === 5 || tag === 6) pool.push({ kind: 'other' });
        cursor += size;
    }

    const utf8 = (index: number): string => {
        const entry = pool[index];
        if (entry?.kind !== 'utf8') throw new Error(`constant ${index} is not a string`);
        return entry.text;
    };
    const className = (index: number): string => {
        const entry = pool[index];
        if (entry?.kind !== 'class') throw new Error(`constant ${index} is not a class`);
        return utf8(entry.name);
    };
    const memberRef = (index: number): { readonly member: string; readonly descriptor: string } => {
        const member = pool[index];
        if (member?.kind !== 'member') throw new Error(`constant ${index} is not a member`);
        const nameAndType = pool[member.nameAndType];
        if (nameAndType?.kind !== 'nameAndType') throw new Error(`constant ${index} is malformed`);
        return {
            member: `${className(member.owner)}.${utf8(nameAndType.name)}`,
            descriptor: utf8(nameAndType.descriptor)
        };
    };
    const constantAt = (index: number): number | string | undefined => {
        const entry = pool[index];
        if (entry?.kind === 'number') return entry.value;
        if (entry?.kind === 'string') return utf8(entry.text);
        return undefined;
    };

    const access = cursor;
    const name = className(view.getUint16(access + 2));
    const superIndex = view.getUint16(access + 4);
    const interfaceCount = view.getUint16(access + 6);
    const interfaces: string[] = [];
    for (let index = 0; index < interfaceCount; index++)
        interfaces.push(className(view.getUint16(access + 8 + 2 * index)));
    cursor = access + 8 + 2 * interfaceCount;

    const constants = new Map<string, number>();
    const fieldCount = view.getUint16(cursor);
    cursor += 2;
    for (let field = 0; field < fieldCount; field++) {
        const fieldName = utf8(view.getUint16(cursor + 2));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        for (let attribute = 0; attribute < attributes; attribute++) {
            if (utf8(view.getUint16(cursor)) === 'ConstantValue') {
                const value = constantAt(view.getUint16(cursor + 6));
                if (typeof value === 'number') constants.set(fieldName, value);
            }
            cursor += 6 + view.getUint32(cursor + 2);
        }
    }

    const rawMethods: { name: string; descriptor: string; code: Uint8Array | undefined }[] = [];
    const methodCount = view.getUint16(cursor);
    cursor += 2;
    for (let method = 0; method < methodCount; method++) {
        const methodName = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let code: Uint8Array | undefined;
        for (let attribute = 0; attribute < attributes; attribute++) {
            const length = view.getUint32(cursor + 2);
            if (utf8(view.getUint16(cursor)) === 'Code') {
                const codeLength = view.getUint32(cursor + 10);
                code = bytes.subarray(cursor + 14, cursor + 14 + codeLength);
            }
            cursor += 6 + length;
        }
        rawMethods.push({ name: methodName, descriptor, code });
    }

    // The class attributes follow the methods; only BootstrapMethods matters here, for the
    // method handles an invokedynamic's arguments name.
    const bootstrapHandles: string[][] = [];
    const classAttributes = view.getUint16(cursor);
    cursor += 2;
    for (let attribute = 0; attribute < classAttributes; attribute++) {
        const length = view.getUint32(cursor + 2);
        if (utf8(view.getUint16(cursor)) === 'BootstrapMethods') {
            let at = cursor + 6;
            const count = view.getUint16(at);
            at += 2;
            for (let index = 0; index < count; index++) {
                const argumentCount = view.getUint16(at + 2);
                const handles: string[] = [];
                for (let argument = 0; argument < argumentCount; argument++) {
                    const entry = pool[view.getUint16(at + 4 + 2 * argument)];
                    if (entry?.kind === 'handle') handles.push(memberRef(entry.reference).member);
                }
                bootstrapHandles.push(handles);
                at += 4 + 2 * argumentCount;
            }
        }
        cursor += 6 + length;
    }

    const decode = (code: Uint8Array): JavaInstruction[] => {
        const codeView = new DataView(code.buffer, code.byteOffset, code.byteLength);
        const instructions: JavaInstruction[] = [];
        let pc = 0;
        while (pc < code.length) {
            const opcode = codeView.getUint8(pc);
            let instruction: JavaInstruction = { pc, opcode };
            if (opcode >= OPCODES.ICONST_M1 && opcode <= OPCODES.ICONST_5)
                instruction = { ...instruction, constant: opcode - OPCODES.ICONST_0 };
            else if (WIDE_SHORTHAND_CONSTANTS.has(opcode))
                instruction = { ...instruction, constant: WIDE_SHORTHAND_CONSTANTS.get(opcode) ?? 0 };
            else if (opcode === OPCODES.BIPUSH) instruction = { ...instruction, constant: codeView.getInt8(pc + 1) };
            else if (opcode === OPCODES.SIPUSH) instruction = { ...instruction, constant: codeView.getInt16(pc + 1) };
            else if (opcode === OPCODES.LDC) {
                const constant = constantAt(codeView.getUint8(pc + 1));
                if (constant !== undefined) instruction = { ...instruction, constant };
            } else if (opcode === OPCODES.LDC_W || opcode === OPCODES.LDC2_W) {
                const constant = constantAt(codeView.getUint16(pc + 1));
                if (constant !== undefined) instruction = { ...instruction, constant };
            } else if (opcode >= 0xb2 && opcode <= OPCODES.INVOKEINTERFACE) {
                instruction = { ...instruction, ...memberRef(codeView.getUint16(pc + 1)) };
            } else if (opcode === OPCODES.INVOKEDYNAMIC) {
                const entry = pool[codeView.getUint16(pc + 1)];
                if (entry?.kind === 'dynamic')
                    instruction = { ...instruction, handles: bootstrapHandles[entry.bootstrap] ?? [] };
            } else if (opcode === OPCODES.NEW || opcode === OPCODES.CHECKCAST || opcode === OPCODES.INSTANCEOF) {
                instruction = { ...instruction, type: className(codeView.getUint16(pc + 1)) };
            } else if ((opcode >= OPCODES.IFEQ && opcode <= OPCODES.GOTO) || opcode === 0xc6 || opcode === 0xc7) {
                instruction = { ...instruction, target: pc + codeView.getInt16(pc + 1) };
            }
            instructions.push(instruction);

            if (opcode === TABLESWITCH || opcode === LOOKUPSWITCH) {
                // The operands start at the next multiple of four from the start of the code.
                const operands = (pc + 4) & ~3;
                if (opcode === TABLESWITCH) {
                    const low = codeView.getInt32(operands + 4);
                    const high = codeView.getInt32(operands + 8);
                    pc = operands + 12 + 4 * (high - low + 1);
                } else pc = operands + 8 + 8 * codeView.getInt32(operands + 4);
            } else if (opcode === WIDE) pc += codeView.getUint8(pc + 1) === IINC ? 6 : 4;
            else pc += 1 + (OPERAND_SIZE.get(opcode) ?? 0);
        }
        return instructions;
    };

    const methods = rawMethods.map((raw): JavaMethod => {
        const instructions = raw.code === undefined ? [] : decode(raw.code);
        return {
            name: raw.name,
            descriptor: raw.descriptor,
            calls: instructions.flatMap((instruction) =>
                instruction.opcode >= OPCODES.INVOKEVIRTUAL &&
                instruction.opcode <= OPCODES.INVOKEINTERFACE &&
                instruction.member !== undefined
                    ? [simpleMember(instruction.member)]
                    : []
            ),
            instructions
        };
    });

    return {
        name,
        ...(superIndex === 0 ? {} : { superName: className(superIndex) }),
        interfaces,
        methods,
        constants
    };
};

/**
 * Parses a class file's methods and the calls in each one's code.
 *
 * @param bytes - The `.class` file.
 * @returns The class's methods in declaration order. An abstract or native method has no calls.
 * @throws {Error} When the bytes are not a class file.
 */
export const javaClassMethods = (bytes: Uint8Array): JavaMethod[] => [...javaClass(bytes).methods];

/** The inner server jar's entries, inflated once per process when a class is not cached yet. */
let inflatedJar: Map<string, Uint8Array> | undefined;

/** Parsed classes by binary name, so a hierarchy walk reads each class file once. */
const parsedClasses = new Map<string, JavaClass | undefined>();

/**
 * One class of the pinned Java server jar, or undefined when the jar holds no such class, which
 * is the case for the JDK classes at the top of every hierarchy.
 *
 * Reading the jar inflates every entry, so each class file is kept in the fetch cache beside the
 * jar and later runs read that copy.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/Mob`.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassFile = (className: string): JavaClass | undefined => {
    if (parsedClasses.has(className)) return parsedClasses.get(className);

    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');

    const version = basename(dirname(jarPath)) || 'unknown';
    const entry = `${className}.class`;
    const cached = join(FETCH_CACHE, 'java-classes', version, ...entry.split('/'));
    let parsed: JavaClass | undefined;
    if (existsSync(cached)) parsed = javaClass(readFileSync(cached));
    else if (className.startsWith('net/minecraft/') || className.startsWith('com/mojang/')) {
        inflatedJar ??= readServerJar(jarPath);
        const bytes = inflatedJar.get(entry);
        if (bytes !== undefined) {
            mkdirSync(dirname(cached), { recursive: true });
            writeFileSync(cached, bytes);
            parsed = javaClass(bytes);
        }
    }
    parsedClasses.set(className, parsed);
    return parsed;
};

/**
 * The methods of one class in the pinned Java server jar.
 *
 * @param className - The class's binary name, such as
 *   `net/minecraft/server/network/ServerGamePacketListenerImpl`.
 * @throws {Error} When the jar is not in the fetch cache, or does not hold the class.
 */
export const pinnedJavaClass = (className: string): JavaMethod[] => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return [...parsed.methods];
};

/**
 * Each number a method's code pushes onto the stack, in the order it appears: the `iconst`
 * shorthands, `bipush` and `sipush`, and the numbers `ldc` loads.
 *
 * @param method - A parsed method; none reads as no constants.
 */
export const numericConstants = (method: JavaMethod | undefined): readonly number[] =>
    (method?.instructions ?? []).flatMap((instruction) =>
        typeof instruction.constant === 'number' ? [instruction.constant] : []
    );

/**
 * The method a class runs for a name with no arguments: its own, or the nearest superclass's,
 * which is what a virtual call on an instance of the class dispatches to.
 *
 * @param className - The class's binary name.
 * @param name - The method's name; only a method that takes no arguments matches.
 * @returns The method and the class that declares it, or undefined when no class in the chain declares one.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaMethod = (
    className: string,
    name: string
): { readonly owner: string; readonly method: JavaMethod } | undefined => {
    for (let owner: string | undefined = className; owner !== undefined;) {
        const parsed = pinnedJavaClassFile(owner);
        if (parsed === undefined) return undefined;
        const method = parsed.methods.find(
            (candidate) => candidate.name === name && candidate.descriptor.startsWith('()')
        );
        if (method !== undefined) return { owner, method };
        owner = parsed.superName;
    }
    return undefined;
};

/**
 * One instruction of a method's code that names something a row can compare: a method it calls,
 * a field it reads or writes, or a constant it pushes. Targets are `Owner.member` with the owner's
 * simple name, as {@link JavaMethod.calls} lists them.
 */
export type JavaOperation =
    | { readonly kind: 'call'; readonly target: string }
    | { readonly kind: 'field'; readonly target: string; readonly write: boolean }
    | { readonly kind: 'string'; readonly value: string }
    | { readonly kind: 'number'; readonly value: number };

const GETSTATIC = 0xb2;
const PUTSTATIC = 0xb3;
const PUTFIELD = 0xb5;

/**
 * A method's calls, field accesses and pushed constants, in the order its code has them; every
 * other instruction is left out.
 *
 * @param method - A parsed method.
 */
export const javaOperations = (method: Pick<JavaMethod, 'instructions'>): readonly JavaOperation[] =>
    method.instructions.flatMap((instruction): JavaOperation[] => {
        if (typeof instruction.constant === 'number') return [{ kind: 'number', value: instruction.constant }];
        if (typeof instruction.constant === 'string') return [{ kind: 'string', value: instruction.constant }];
        if (instruction.member === undefined) return [];
        const target = instruction.member.slice(instruction.member.lastIndexOf('/') + 1);
        if (instruction.opcode >= GETSTATIC && instruction.opcode <= PUTFIELD)
            return [
                {
                    kind: 'field',
                    target,
                    write: instruction.opcode === PUTSTATIC || instruction.opcode === PUTFIELD
                }
            ];
        if (instruction.opcode >= OPCODES.INVOKEVIRTUAL && instruction.opcode <= OPCODES.INVOKEINTERFACE)
            return [{ kind: 'call', target }];
        return [];
    });

/**
 * The binary name of every class in the pinned jar under a package prefix, such as
 * `net/minecraft/world/entity/`.
 *
 * The first listing inflates the jar and keeps the names in the fetch cache beside the class
 * files, so later runs read that list.
 *
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassNames = (prefix: string): readonly string[] => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');
    const index = join(FETCH_CACHE, 'java-classes', basename(dirname(jarPath)) || 'unknown', 'classes.json');
    let names: readonly string[] | undefined;
    if (existsSync(index)) {
        // Parsed JSON boundary; the file is only written below, as a list of class names.
        const parsed: unknown = JSON.parse(readFileSync(index, 'utf-8'));
        if (Array.isArray(parsed)) names = parsed.filter((name): name is string => typeof name === 'string');
    }
    if (names === undefined) {
        inflatedJar ??= readServerJar(jarPath);
        names = [...inflatedJar.keys()]
            .filter((entry) => entry.endsWith('.class'))
            .map((entry) => entry.slice(0, -'.class'.length));
        mkdirSync(dirname(index), { recursive: true });
        writeFileSync(index, JSON.stringify(names));
    }
    return names.filter((name) => name.startsWith(prefix));
};

/**
 * The numeric `static final` constants of one class in the pinned Java server jar, by field name.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/AgeableMob`.
 * @throws {Error} When the jar is not in the fetch cache, or does not hold the class.
 */
export const pinnedJavaConstants = (className: string): ReadonlyMap<string, number> => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return parsed.constants;
};
