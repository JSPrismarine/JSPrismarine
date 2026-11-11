import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { readServerJar } from './javaDatapack.ts';
import { FETCH_CACHE, REFERENCES } from './references.ts';

/**
 * Reads which methods each method of a Java class calls, in bytecode order, out of the pinned
 * server jar.
 *
 * Some Java rules live only in code, such as the checks a packet handler makes before it acts
 * on a block position. A row that compares against one reads the handler's calls from the class
 * file, so a Java version that drops or reorders a check fails the row instead of leaving a
 * comment that no longer says what Java does. Nothing here runs the class; it is parsed as data.
 */

/** One method of a class and the methods its code calls. */
export interface JavaMethod {
    readonly name: string;
    readonly descriptor: string;
    /** `Owner.name` of each `invoke*` instruction but `invokedynamic`, in the order they appear. */
    readonly calls: readonly string[];
}

/** The constant pool entries this reader resolves; every other kind is skipped by its size. */
type PoolEntry =
    | { readonly kind: 'utf8'; readonly text: string }
    | { readonly kind: 'class'; readonly name: number }
    | { readonly kind: 'member'; readonly owner: number; readonly nameAndType: number }
    | { readonly kind: 'nameAndType'; readonly name: number; readonly descriptor: number }
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

const TABLESWITCH = 0xaa;
const LOOKUPSWITCH = 0xab;
const WIDE = 0xc4;
const IINC = 0x84;
const INVOKEVIRTUAL = 0xb6;
const INVOKEINTERFACE = 0xb9;

/**
 * Parses a class file's methods and the calls in each one's code.
 *
 * @param bytes - The `.class` file.
 * @returns The class's methods in declaration order. An abstract or native method has no calls.
 * @throws {Error} When the bytes are not a class file.
 */
export const javaClassMethods = (bytes: Uint8Array): JavaMethod[] => {
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
        else if (tag === 10 || tag === 11) {
            pool.push({ kind: 'member', owner: view.getUint16(cursor), nameAndType: view.getUint16(cursor + 2) });
        } else if (tag === 12) {
            pool.push({ kind: 'nameAndType', name: view.getUint16(cursor), descriptor: view.getUint16(cursor + 2) });
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
    const methodRef = (index: number): string => {
        const member = pool[index];
        if (member?.kind !== 'member') throw new Error(`constant ${index} is not a method`);
        const owner = pool[member.owner];
        const nameAndType = pool[member.nameAndType];
        if (owner?.kind !== 'class' || nameAndType?.kind !== 'nameAndType') {
            throw new Error(`constant ${index} is malformed`);
        }
        const ownerName = utf8(owner.name);
        return `${ownerName.slice(ownerName.lastIndexOf('/') + 1)}.${utf8(nameAndType.name)}`;
    };

    // Access flags, this class and super class, then the interfaces.
    cursor += 6;
    cursor += 2 + 2 * view.getUint16(cursor);

    const skipMembers = (): void => {
        const count = view.getUint16(cursor);
        cursor += 2;
        for (let member = 0; member < count; member++) {
            const attributes = view.getUint16(cursor + 6);
            cursor += 8;
            for (let attribute = 0; attribute < attributes; attribute++) cursor += 6 + view.getUint32(cursor + 2);
        }
    };
    skipMembers();

    const methods: JavaMethod[] = [];
    const methodCount = view.getUint16(cursor);
    cursor += 2;
    for (let method = 0; method < methodCount; method++) {
        const name = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let calls: string[] = [];
        for (let attribute = 0; attribute < attributes; attribute++) {
            const length = view.getUint32(cursor + 2);
            if (utf8(view.getUint16(cursor)) === 'Code') {
                const codeLength = view.getUint32(cursor + 10);
                calls = invokedMethods(bytes.subarray(cursor + 14, cursor + 14 + codeLength), methodRef);
            }
            cursor += 6 + length;
        }
        methods.push({ name, descriptor, calls });
    }
    return methods;
};

/** The methods a method's code calls, walking it one instruction at a time. */
const invokedMethods = (code: Uint8Array, methodRef: (index: number) => string): string[] => {
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const calls: string[] = [];
    let pc = 0;
    while (pc < code.length) {
        const opcode = view.getUint8(pc);
        if (opcode >= INVOKEVIRTUAL && opcode <= INVOKEINTERFACE) calls.push(methodRef(view.getUint16(pc + 1)));

        if (opcode === TABLESWITCH || opcode === LOOKUPSWITCH) {
            // The operands start at the next multiple of four from the start of the code.
            const operands = (pc + 4) & ~3;
            if (opcode === TABLESWITCH) {
                const low = view.getInt32(operands + 4);
                const high = view.getInt32(operands + 8);
                pc = operands + 12 + 4 * (high - low + 1);
            } else pc = operands + 8 + 8 * view.getInt32(operands + 4);
        } else if (opcode === WIDE) pc += view.getUint8(pc + 1) === IINC ? 6 : 4;
        else pc += 1 + (OPERAND_SIZE.get(opcode) ?? 0);
    }
    return calls;
};

/**
 * The methods of one class in the pinned Java server jar.
 *
 * Reading the jar inflates every entry, so the first call keeps the class file in the fetch cache beside the jar and later calls read
 * that copy.
 *
 * @param className - The class's binary name, such as
 *   `net/minecraft/server/network/ServerGamePacketListenerImpl`.
 * @throws {Error} When the jar is not in the fetch cache, or does not hold the class.
 */
export const pinnedJavaClass = (className: string): JavaMethod[] => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');

    const version = basename(dirname(jarPath)) || 'unknown';
    const entry = `${className}.class`;
    const cached = join(FETCH_CACHE, 'java-classes', version, ...entry.split('/'));
    if (!existsSync(cached)) {
        const bytes = readServerJar(jarPath).get(entry);
        if (bytes === undefined) throw new Error(`the server jar holds no ${entry}`);
        mkdirSync(dirname(cached), { recursive: true });
        writeFileSync(cached, bytes);
    }
    return javaClassMethods(readFileSync(cached));
};
