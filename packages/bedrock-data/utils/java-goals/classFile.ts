/**
 * A raw view of a Java class file: its constant pool, fields and each method's undecoded `Code`
 * bytes, for a reader such as `goals.ts` that interprets the bytecode itself.
 *
 * This is capture-time tooling. It reads class files out of the pinned Java Edition server jar,
 * which is untrusted data, and never loads or runs them.
 */

/** One constant pool entry, resolved enough for the readers here; the kinds they never read are `other`. */
type PoolEntry =
    | { readonly kind: 'utf8'; readonly text: string }
    | { readonly kind: 'number'; readonly value: number; readonly wide: boolean }
    | { readonly kind: 'class'; readonly name: number }
    | { readonly kind: 'string'; readonly text: number }
    | { readonly kind: 'member'; readonly owner: number; readonly nameAndType: number }
    | { readonly kind: 'nameAndType'; readonly name: number; readonly descriptor: number }
    | { readonly kind: 'methodHandle'; readonly reference: number }
    | { readonly kind: 'invokeDynamic'; readonly bootstrap: number; readonly nameAndType: number }
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

/** A field or method reference out of the constant pool, with its owner's binary name. */
export interface JavaMemberRef {
    /** The owner's binary name, such as `net/minecraft/world/entity/ai/goal/FloatGoal`. */
    readonly owner: string;
    readonly name: string;
    readonly descriptor: string;
}

/** A loadable constant: a number, a string, or a class literal. */
export type JavaConstant =
    | { readonly kind: 'number'; readonly value: number; readonly wide: boolean }
    | { readonly kind: 'string'; readonly value: string }
    | { readonly kind: 'class'; readonly name: string };

/** One field a class declares. */
export interface JavaField {
    readonly name: string;
    readonly descriptor: string;
    /** The generic signature, when the field has one, such as `Lnet/minecraft/world/entity/EntityType<L...Cow;>;`. */
    readonly signature: string | undefined;
}

/** One method a class declares, with its bytecode. */
export interface JavaCodeMethod {
    readonly name: string;
    readonly descriptor: string;
    readonly static: boolean;
    /** The `Code` attribute's instructions, absent for an abstract or native method. */
    readonly code: Uint8Array | undefined;
    /** The name of each local variable slot live from the first instruction, which covers the parameters. */
    readonly parameterNames: ReadonlyMap<number, string>;
}

/** A parsed class file: its names, members, and the constant pool lookups its bytecode needs. */
export interface JavaClass {
    /** This class's binary name. */
    readonly name: string;
    /** The superclass's binary name, absent for `java/lang/Object`. */
    readonly superName: string | undefined;
    readonly fields: readonly JavaField[];
    readonly methods: readonly JavaCodeMethod[];
    /** The field or method a `get*`, `put*` or `invoke*` operand names. */
    member(index: number): JavaMemberRef;
    /** The class an operand of `new`, `anewarray` or `checkcast` names. */
    className(index: number): string;
    /** The constant an `ldc` operand names, or undefined for the kinds it does not resolve. */
    constant(index: number): JavaConstant | undefined;
    /**
     * The method an `invokedynamic` operand's lambda or method reference points at, which is the
     * bootstrap method's second argument, or undefined when it is not a plain lambda.
     */
    lambdaTarget(index: number): JavaMemberRef | undefined;
    /** The descriptor of the call site an `invokedynamic` operand names. */
    dynamicDescriptor(index: number): string;
}

const ACC_STATIC = 0x0008;

/**
 * Parses a class file's names, fields, methods with their code, and the constant pool lookups
 * a bytecode reader needs.
 *
 * @param bytes - The `.class` file.
 * @throws {Error} When the bytes are not a class file.
 */
export const parseJavaClass = (bytes: Uint8Array): JavaClass => {
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
        if (tag === 3) pool.push({ kind: 'number', value: view.getInt32(cursor), wide: false });
        else if (tag === 4) pool.push({ kind: 'number', value: view.getFloat32(cursor), wide: false });
        else if (tag === 5) pool.push({ kind: 'number', value: Number(view.getBigInt64(cursor)), wide: true });
        else if (tag === 6) pool.push({ kind: 'number', value: view.getFloat64(cursor), wide: true });
        else if (tag === 7) pool.push({ kind: 'class', name: view.getUint16(cursor) });
        else if (tag === 8) pool.push({ kind: 'string', text: view.getUint16(cursor) });
        else if (tag === 9 || tag === 10 || tag === 11) {
            pool.push({ kind: 'member', owner: view.getUint16(cursor), nameAndType: view.getUint16(cursor + 2) });
        } else if (tag === 12) {
            pool.push({ kind: 'nameAndType', name: view.getUint16(cursor), descriptor: view.getUint16(cursor + 2) });
        } else if (tag === 15) pool.push({ kind: 'methodHandle', reference: view.getUint16(cursor + 1) });
        else if (tag === 18) {
            pool.push({
                kind: 'invokeDynamic',
                bootstrap: view.getUint16(cursor),
                nameAndType: view.getUint16(cursor + 2)
            });
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
    const nameAndType = (index: number): { readonly name: string; readonly descriptor: string } => {
        const entry = pool[index];
        if (entry?.kind !== 'nameAndType') throw new Error(`constant ${index} is not a name and type`);
        return { name: utf8(entry.name), descriptor: utf8(entry.descriptor) };
    };
    const member = (index: number): JavaMemberRef => {
        const entry = pool[index];
        if (entry?.kind !== 'member') throw new Error(`constant ${index} is not a member`);
        return { owner: className(entry.owner), ...nameAndType(entry.nameAndType) };
    };
    const constant = (index: number): JavaConstant | undefined => {
        const entry = pool[index];
        if (entry?.kind === 'number') return entry;
        if (entry?.kind === 'string') return { kind: 'string', value: utf8(entry.text) };
        if (entry?.kind === 'class') return { kind: 'class', name: utf8(entry.name) };
        return undefined;
    };

    // Access flags, this class and super class, then the interfaces.
    const name = className(view.getUint16(cursor + 2));
    const superIndex = view.getUint16(cursor + 4);
    const superName = superIndex === 0 ? undefined : className(superIndex);
    cursor += 6;
    cursor += 2 + 2 * view.getUint16(cursor);

    const fields: JavaField[] = [];
    const fieldCount = view.getUint16(cursor);
    cursor += 2;
    for (let field = 0; field < fieldCount; field++) {
        const fieldName = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let signature: string | undefined;
        for (let attribute = 0; attribute < attributes; attribute++) {
            if (utf8(view.getUint16(cursor)) === 'Signature') signature = utf8(view.getUint16(cursor + 6));
            cursor += 6 + view.getUint32(cursor + 2);
        }
        fields.push({ name: fieldName, descriptor, signature });
    }

    const methods: JavaCodeMethod[] = [];
    const methodCount = view.getUint16(cursor);
    cursor += 2;
    for (let method = 0; method < methodCount; method++) {
        const access = view.getUint16(cursor);
        const methodName = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let code: Uint8Array | undefined;
        const parameterNames = new Map<number, string>();
        for (let attribute = 0; attribute < attributes; attribute++) {
            const length = view.getUint32(cursor + 2);
            if (utf8(view.getUint16(cursor)) === 'Code') {
                const codeLength = view.getUint32(cursor + 10);
                code = bytes.subarray(cursor + 14, cursor + 14 + codeLength);
                // The exception table, then the code's own attributes, of which the local variable table names the slots.
                let at = cursor + 14 + codeLength;
                at += 2 + 8 * view.getUint16(at);
                const codeAttributes = view.getUint16(at);
                at += 2;
                for (let codeAttribute = 0; codeAttribute < codeAttributes; codeAttribute++) {
                    if (utf8(view.getUint16(at)) === 'LocalVariableTable') {
                        const count = view.getUint16(at + 6);
                        for (let entry = 0; entry < count; entry++) {
                            const row = at + 8 + 10 * entry;
                            if (view.getUint16(row) === 0) {
                                parameterNames.set(view.getUint16(row + 8), utf8(view.getUint16(row + 4)));
                            }
                        }
                    }
                    at += 6 + view.getUint32(at + 2);
                }
            }
            cursor += 6 + length;
        }
        methods.push({ name: methodName, descriptor, static: (access & ACC_STATIC) !== 0, code, parameterNames });
    }

    // The class attributes, of which only the bootstrap methods are read.
    const bootstrapArguments: (readonly number[])[] = [];
    const classAttributes = view.getUint16(cursor);
    cursor += 2;
    for (let attribute = 0; attribute < classAttributes; attribute++) {
        const length = view.getUint32(cursor + 2);
        if (utf8(view.getUint16(cursor)) === 'BootstrapMethods') {
            let at = cursor + 8;
            const count = view.getUint16(cursor + 6);
            for (let entry = 0; entry < count; entry++) {
                const argumentCount = view.getUint16(at + 2);
                const argumentsOf: number[] = [];
                for (let argument = 0; argument < argumentCount; argument++) {
                    argumentsOf.push(view.getUint16(at + 4 + 2 * argument));
                }
                bootstrapArguments.push(argumentsOf);
                at += 4 + 2 * argumentCount;
            }
        }
        cursor += 6 + length;
    }

    const dynamic = (index: number): Extract<PoolEntry, { kind: 'invokeDynamic' }> => {
        const entry = pool[index];
        if (entry?.kind !== 'invokeDynamic') throw new Error(`constant ${index} is not a call site`);
        return entry;
    };

    return {
        name,
        superName,
        fields,
        methods,
        member,
        className,
        constant,
        lambdaTarget: (index) => {
            // LambdaMetafactory's arguments are the erased type, the implementation handle and the instantiated type.
            const handle = pool[bootstrapArguments[dynamic(index).bootstrap]?.[1] ?? 0];
            return handle?.kind === 'methodHandle' ? member(handle.reference) : undefined;
        },
        dynamicDescriptor: (index) => nameAndType(dynamic(index).nameAndType).descriptor
    };
};

/**
 * The byte length of the instruction at `pc`, operands included.
 *
 * @param code - A method's `Code` bytes.
 * @param pc - The offset of the instruction's opcode.
 */
export const instructionLength = (code: Uint8Array, pc: number): number => {
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const opcode = view.getUint8(pc);
    if (opcode === TABLESWITCH || opcode === LOOKUPSWITCH) {
        // The operands start at the next multiple of four from the start of the code.
        const operands = (pc + 4) & ~3;
        if (opcode === TABLESWITCH) {
            const low = view.getInt32(operands + 4);
            const high = view.getInt32(operands + 8);
            return operands + 12 + 4 * (high - low + 1) - pc;
        }
        return operands + 8 + 8 * view.getInt32(operands + 4) - pc;
    }
    if (opcode === WIDE) return view.getUint8(pc + 1) === IINC ? 6 : 4;
    return 1 + (OPERAND_SIZE.get(opcode) ?? 0);
};
