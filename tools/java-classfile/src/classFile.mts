/**
 * A raw view of a Java class file: its constant pool, fields and each method's undecoded `Code`
 * bytes, for a reader that interprets the bytecode itself, and for `instructions.mts`, which
 * decodes it.
 *
 * The class files come out of the pinned Java Edition server jar, which is untrusted data. Nothing
 * here loads or runs them.
 */

/** One constant pool entry, resolved enough for the readers here; the kinds they never read are `other`. */
type PoolEntry =
    | { readonly kind: 'utf8'; readonly text: string }
    | {
          readonly kind: 'number';
          readonly value: number;
          readonly type: NumberType;
          /** The value exactly, which `value` is not for a long past 2^53. */
          readonly text: string;
      }
    | { readonly kind: 'class'; readonly name: number }
    | { readonly kind: 'string'; readonly text: number }
    | { readonly kind: 'member'; readonly owner: number; readonly nameAndType: number }
    | { readonly kind: 'nameAndType'; readonly name: number; readonly descriptor: number }
    | { readonly kind: 'methodHandle'; readonly referenceKind: number; readonly reference: number }
    | { readonly kind: 'methodType'; readonly descriptor: number }
    | {
          readonly kind: 'dynamic';
          readonly constant: boolean;
          readonly bootstrap: number;
          readonly nameAndType: number;
      }
    | { readonly kind: 'other' };

/** The JVM type of a numeric constant. */
type NumberType = 'int' | 'float' | 'long' | 'double';

/** A numeric pool entry whose value a double holds exactly, with `-0` kept apart from `0`. */
const numberEntry = (value: number, type: NumberType): Extract<PoolEntry, { kind: 'number' }> => ({
    kind: 'number',
    value,
    type,
    text: Object.is(value, -0) ? '-0' : String(value)
});

/**
 * Each method handle's `reference_kind` (JVMS 4.4.8), which tells a `getStatic` of a field from a
 * `putStatic` of the same field.
 */
const REFERENCE_KINDS: readonly string[] = [
    '',
    'getField',
    'getStatic',
    'putField',
    'putStatic',
    'invokeVirtual',
    'invokeStatic',
    'invokeSpecial',
    'newInvokeSpecial',
    'invokeInterface'
];

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
    readonly access: number;
    /** The generic signature, when the field has one, such as `Lnet/minecraft/world/entity/EntityType<L...Cow;>;`. */
    readonly signature: string | undefined;
    /** The `ConstantValue` attribute `javac` writes for a `static final` primitive or string, rendered as {@link JavaClass.describeConstant} does. */
    readonly constantValue: string | undefined;
    /** The `ConstantValue` when it is a number, such as `Sniffer.SNIFFER_BABY_START_AGE`. */
    readonly numericValue: number | undefined;
}

/** One entry of a method's exception table, as code offsets. */
export interface JavaExceptionHandler {
    readonly start: number;
    readonly end: number;
    readonly handler: number;
    /** The caught class's binary name, or undefined for a `finally` block, which catches anything. */
    readonly catchType: string | undefined;
}

/** One method a class declares, with its bytecode. */
export interface JavaCodeMethod {
    readonly name: string;
    readonly descriptor: string;
    readonly access: number;
    readonly static: boolean;
    /** The `Code` attribute's instructions, absent for an abstract or native method. */
    readonly code: Uint8Array | undefined;
    readonly exceptionTable: readonly JavaExceptionHandler[];
    /** The name of each local variable slot live from the first instruction, which covers the parameters. */
    readonly parameterNames: ReadonlyMap<number, string>;
}

/** A bootstrap method an `invokedynamic` or a dynamic constant names, with its static arguments. */
export interface JavaBootstrap {
    /** The bootstrap method, such as `java/lang/invoke/LambdaMetafactory.metafactory`. */
    readonly method: JavaMemberRef;
    /** Each static argument's pool index. */
    readonly arguments: readonly number[];
}

/** A parsed class file: its names, members, and the constant pool lookups its bytecode needs. */
export interface JavaClass {
    /** This class's binary name. */
    readonly name: string;
    /** The superclass's binary name, absent for `java/lang/Object`. */
    readonly superName: string | undefined;
    readonly access: number;
    readonly interfaces: readonly string[];
    readonly fields: readonly JavaField[];
    readonly methods: readonly JavaCodeMethod[];
    /** The field or method a `get*`, `put*` or `invoke*` operand names. */
    member(index: number): JavaMemberRef;
    /** The class an operand of `new`, `anewarray` or `checkcast` names. */
    className(index: number): string;
    /** The constant an `ldc` operand names, or undefined for the kinds it does not resolve. */
    constant(index: number): JavaConstant | undefined;
    /**
     * Any loadable constant or bootstrap argument as text that keeps its type: `int 5`,
     * `float 0.5`, `string "x"`, `class net/minecraft/...`, a method handle as its reference kind
     * and member, a method type as its descriptor, a dynamic constant as its name and type.
     */
    describeConstant(index: number): string;
    /** The member a method handle constant points at, or undefined when the entry is not a handle. */
    methodHandle(index: number): JavaMemberRef | undefined;
    /**
     * The method an `invokedynamic` operand's lambda or method reference points at, which is the
     * bootstrap method's second argument, or undefined when it is not a plain lambda.
     */
    lambdaTarget(index: number): JavaMemberRef | undefined;
    /** The name and descriptor of the call site an `invokedynamic` operand names. */
    dynamicCallSite(index: number): { readonly name: string; readonly descriptor: string };
    /** The descriptor of the call site an `invokedynamic` operand names. */
    dynamicDescriptor(index: number): string;
    /** The bootstrap method and arguments of the call site an `invokedynamic` operand names. */
    dynamicBootstrap(index: number): JavaBootstrap | undefined;
}

/** `ACC_PRIVATE` (JVMS 4.6). */
export const ACC_PRIVATE = 0x0002;
/** `ACC_STATIC` (JVMS 4.6). */
export const ACC_STATIC = 0x0008;
/** `ACC_SYNCHRONIZED` (JVMS 4.6), which makes a method hold its object's or class's monitor. */
export const ACC_SYNCHRONIZED = 0x0020;
/**
 * `ACC_BRIDGE` (JVMS 4.6), which `javac` sets on the method it writes to forward an erased
 * override, such as `start(ServerLevel, LivingEntity, long)` to `start(ServerLevel, Sniffer, long)`.
 */
export const ACC_BRIDGE = 0x0040;
/** `ACC_SYNTHETIC` (JVMS 4.6), which `javac` sets on the methods it writes for lambdas. */
export const ACC_SYNTHETIC = 0x1000;

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
        if (tag === 3) pool.push(numberEntry(view.getInt32(cursor), 'int'));
        else if (tag === 4) pool.push(numberEntry(view.getFloat32(cursor), 'float'));
        else if (tag === 5) {
            const long = view.getBigInt64(cursor);
            pool.push({ kind: 'number', value: Number(long), type: 'long', text: long.toString() });
        } else if (tag === 6) pool.push(numberEntry(view.getFloat64(cursor), 'double'));
        else if (tag === 7) pool.push({ kind: 'class', name: view.getUint16(cursor) });
        else if (tag === 8) pool.push({ kind: 'string', text: view.getUint16(cursor) });
        else if (tag === 9 || tag === 10 || tag === 11) {
            pool.push({ kind: 'member', owner: view.getUint16(cursor), nameAndType: view.getUint16(cursor + 2) });
        } else if (tag === 12) {
            pool.push({ kind: 'nameAndType', name: view.getUint16(cursor), descriptor: view.getUint16(cursor + 2) });
        } else if (tag === 15) {
            pool.push({
                kind: 'methodHandle',
                referenceKind: view.getUint8(cursor),
                reference: view.getUint16(cursor + 1)
            });
        } else if (tag === 16) pool.push({ kind: 'methodType', descriptor: view.getUint16(cursor) });
        else if (tag === 17 || tag === 18) {
            pool.push({
                kind: 'dynamic',
                constant: tag === 17,
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
        if (entry?.kind === 'number')
            return { kind: 'number', value: entry.value, wide: entry.type === 'long' || entry.type === 'double' };
        if (entry?.kind === 'string') return { kind: 'string', value: utf8(entry.text) };
        if (entry?.kind === 'class') return { kind: 'class', name: utf8(entry.name) };
        return undefined;
    };
    const methodHandle = (index: number): JavaMemberRef | undefined => {
        const entry = pool[index];
        return entry?.kind === 'methodHandle' ? member(entry.reference) : undefined;
    };
    const describeConstant = (index: number): string => {
        const entry = pool[index];
        switch (entry?.kind) {
            case 'number':
                return `${entry.type} ${entry.text}`;
            case 'string':
                return `string ${JSON.stringify(utf8(entry.text))}`;
            case 'class':
                return `class ${utf8(entry.name)}`;
            case 'methodHandle': {
                const target = member(entry.reference);
                const kind = REFERENCE_KINDS[entry.referenceKind] ?? `kind${entry.referenceKind}`;
                return `handle ${kind} ${target.owner}.${target.name}${target.descriptor}`;
            }
            case 'methodType':
                return `methodType ${utf8(entry.descriptor)}`;
            case 'dynamic': {
                const site = nameAndType(entry.nameAndType);
                return `dynamic ${site.name} ${site.descriptor}`;
            }
            default:
                return `constant ${index}`;
        }
    };

    const access = view.getUint16(cursor);
    const name = className(view.getUint16(cursor + 2));
    const superIndex = view.getUint16(cursor + 4);
    const superName = superIndex === 0 ? undefined : className(superIndex);
    const interfaceCount = view.getUint16(cursor + 6);
    const interfaces: string[] = [];
    for (let index = 0; index < interfaceCount; index++)
        interfaces.push(className(view.getUint16(cursor + 8 + 2 * index)));
    cursor += 8 + 2 * interfaceCount;

    const fields: JavaField[] = [];
    const fieldCount = view.getUint16(cursor);
    cursor += 2;
    for (let field = 0; field < fieldCount; field++) {
        const fieldAccess = view.getUint16(cursor);
        const fieldName = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let signature: string | undefined;
        let constantValue: string | undefined;
        let numericValue: number | undefined;
        for (let attribute = 0; attribute < attributes; attribute++) {
            const attributeName = utf8(view.getUint16(cursor));
            if (attributeName === 'Signature') signature = utf8(view.getUint16(cursor + 6));
            else if (attributeName === 'ConstantValue') {
                const index = view.getUint16(cursor + 6);
                constantValue = describeConstant(index);
                const entry = pool[index];
                if (entry?.kind === 'number') numericValue = entry.value;
            }
            cursor += 6 + view.getUint32(cursor + 2);
        }
        fields.push({ name: fieldName, descriptor, access: fieldAccess, signature, constantValue, numericValue });
    }

    const methods: JavaCodeMethod[] = [];
    const methodCount = view.getUint16(cursor);
    cursor += 2;
    for (let method = 0; method < methodCount; method++) {
        const methodAccess = view.getUint16(cursor);
        const methodName = utf8(view.getUint16(cursor + 2));
        const descriptor = utf8(view.getUint16(cursor + 4));
        const attributes = view.getUint16(cursor + 6);
        cursor += 8;
        let code: Uint8Array | undefined;
        const exceptionTable: JavaExceptionHandler[] = [];
        const parameterNames = new Map<number, string>();
        for (let attribute = 0; attribute < attributes; attribute++) {
            const length = view.getUint32(cursor + 2);
            if (utf8(view.getUint16(cursor)) === 'Code') {
                const codeLength = view.getUint32(cursor + 10);
                code = bytes.subarray(cursor + 14, cursor + 14 + codeLength);
                // The exception table, then the code's own attributes, of which the local variable table names the slots.
                let at = cursor + 14 + codeLength;
                const handlers = view.getUint16(at);
                for (let handler = 0; handler < handlers; handler++) {
                    const row = at + 2 + 8 * handler;
                    const catchIndex = view.getUint16(row + 6);
                    exceptionTable.push({
                        start: view.getUint16(row),
                        end: view.getUint16(row + 2),
                        handler: view.getUint16(row + 4),
                        catchType: catchIndex === 0 ? undefined : className(catchIndex)
                    });
                }
                at += 2 + 8 * handlers;
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
        methods.push({
            name: methodName,
            descriptor,
            access: methodAccess,
            static: (methodAccess & ACC_STATIC) !== 0,
            code,
            exceptionTable,
            parameterNames
        });
    }

    // The class attributes, of which only the bootstrap methods are read.
    const bootstraps: JavaBootstrap[] = [];
    const classAttributes = view.getUint16(cursor);
    cursor += 2;
    for (let attribute = 0; attribute < classAttributes; attribute++) {
        const length = view.getUint32(cursor + 2);
        if (utf8(view.getUint16(cursor)) === 'BootstrapMethods') {
            let at = cursor + 8;
            const count = view.getUint16(cursor + 6);
            for (let entry = 0; entry < count; entry++) {
                const method = methodHandle(view.getUint16(at));
                const argumentCount = view.getUint16(at + 2);
                const argumentsOf: number[] = [];
                for (let argument = 0; argument < argumentCount; argument++) {
                    argumentsOf.push(view.getUint16(at + 4 + 2 * argument));
                }
                if (method !== undefined) bootstraps[entry] = { method, arguments: argumentsOf };
                at += 4 + 2 * argumentCount;
            }
        }
        cursor += 6 + length;
    }

    const dynamic = (index: number): Extract<PoolEntry, { kind: 'dynamic' }> => {
        const entry = pool[index];
        if (entry?.kind !== 'dynamic') throw new Error(`constant ${index} is not a call site`);
        return entry;
    };

    return {
        name,
        superName,
        access,
        interfaces,
        fields,
        methods,
        member,
        className,
        constant,
        describeConstant,
        methodHandle,
        lambdaTarget: (index) => {
            // LambdaMetafactory's arguments are the erased type, the implementation handle and the instantiated type.
            const handle = bootstraps[dynamic(index).bootstrap]?.arguments[1];
            return handle === undefined ? undefined : methodHandle(handle);
        },
        dynamicCallSite: (index) => nameAndType(dynamic(index).nameAndType),
        dynamicDescriptor: (index) => nameAndType(dynamic(index).nameAndType).descriptor,
        dynamicBootstrap: (index) => bootstraps[dynamic(index).bootstrap]
    };
};
