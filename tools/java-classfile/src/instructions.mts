import type { JavaClass } from './classFile.mts';

/**
 * Decodes a method's `Code` bytes into instructions with their operands resolved against the
 * class's constant pool.
 */

/** One decoded instruction of a method's code. */
export interface JavaInstruction {
    /** The instruction's offset in the method's code. */
    readonly pc: number;
    /** The opcode; for a `wide` instruction, the opcode it widens. */
    readonly opcode: number;
    /**
     * The constant the instruction pushes: an `iconst`, `bipush`, `sipush` or `ldc` value, a
     * string for an `ldc` of a string.
     */
    readonly constant?: number | string;
    /** An `ldc` operand of any kind, as {@link JavaClass.describeConstant} renders it. */
    readonly loads?: string;
    /** The member an `invoke*` or field instruction names, as `owner/Binary/Name.member`. */
    readonly member?: string;
    /** The member's descriptor, for an `invoke*` or field instruction. */
    readonly descriptor?: string;
    /** The class a `new`, `anewarray`, `multianewarray`, `checkcast` or `instanceof` names, as a binary name. */
    readonly type?: string;
    /** Where a branch jumps, as a code offset. */
    readonly target?: number;
    /** A `tableswitch` or `lookupswitch`'s default and its cases, as code offsets by key. */
    readonly switch?: { readonly default: number; readonly cases: readonly (readonly [number, number])[] };
    /** For an `invokedynamic`, the method handles its bootstrap arguments name, as `owner/Binary/Name.member`. */
    readonly handles?: readonly string[];
    /** For an `invokedynamic`, the call site and every bootstrap argument, rendered. */
    readonly callSite?: {
        readonly name: string;
        readonly descriptor: string;
        readonly bootstrap: string;
        readonly arguments: readonly string[];
    };
    /** The local variable a load, store, `iinc` or `ret` names, such as 3 for `istore_3` or `iload 3`. */
    readonly local?: number;
    /** What an `iinc` adds. */
    readonly increment?: number;
    /** A `newarray`'s element type code, or a `multianewarray`'s dimension count. */
    readonly count?: number;
}

/** Opcodes the readers name, for the instruction matchers they write (JVMS 6.5). */
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
    ILOAD: 0x15,
    ISTORE: 0x36,
    IINC: 0x84,
    IFEQ: 0x99,
    IFNE: 0x9a,
    IF_ICMPEQ: 0x9f,
    IF_ICMPNE: 0xa0,
    IF_ICMPLT: 0xa1,
    IF_ICMPGE: 0xa2,
    IF_ICMPGT: 0xa3,
    IF_ICMPLE: 0xa4,
    GOTO: 0xa7,
    JSR: 0xa8,
    RET: 0xa9,
    TABLESWITCH: 0xaa,
    LOOKUPSWITCH: 0xab,
    IRETURN: 0xac,
    DRETURN: 0xaf,
    GETSTATIC: 0xb2,
    PUTSTATIC: 0xb3,
    GETFIELD: 0xb4,
    PUTFIELD: 0xb5,
    INVOKEVIRTUAL: 0xb6,
    INVOKESPECIAL: 0xb7,
    INVOKESTATIC: 0xb8,
    INVOKEINTERFACE: 0xb9,
    INVOKEDYNAMIC: 0xba,
    NEW: 0xbb,
    NEWARRAY: 0xbc,
    ANEWARRAY: 0xbd,
    CHECKCAST: 0xc0,
    INSTANCEOF: 0xc1,
    WIDE: 0xc4,
    MULTIANEWARRAY: 0xc5,
    IFNULL: 0xc6,
    IFNONNULL: 0xc7,
    GOTO_W: 0xc8,
    JSR_W: 0xc9
} as const;

/** Every opcode's mnemonic, by opcode (JVMS 6.5). */
export const MNEMONICS: readonly string[] = [
    'nop',
    'aconst_null',
    'iconst_m1',
    'iconst_0',
    'iconst_1',
    'iconst_2',
    'iconst_3',
    'iconst_4',
    'iconst_5',
    'lconst_0',
    'lconst_1',
    'fconst_0',
    'fconst_1',
    'fconst_2',
    'dconst_0',
    'dconst_1',
    'bipush',
    'sipush',
    'ldc',
    'ldc_w',
    'ldc2_w',
    'iload',
    'lload',
    'fload',
    'dload',
    'aload',
    ...['i', 'l', 'f', 'd', 'a'].flatMap((kind) => [0, 1, 2, 3].map((slot) => `${kind}load_${slot}`)),
    'iaload',
    'laload',
    'faload',
    'daload',
    'aaload',
    'baload',
    'caload',
    'saload',
    'istore',
    'lstore',
    'fstore',
    'dstore',
    'astore',
    ...['i', 'l', 'f', 'd', 'a'].flatMap((kind) => [0, 1, 2, 3].map((slot) => `${kind}store_${slot}`)),
    'iastore',
    'lastore',
    'fastore',
    'dastore',
    'aastore',
    'bastore',
    'castore',
    'sastore',
    'pop',
    'pop2',
    'dup',
    'dup_x1',
    'dup_x2',
    'dup2',
    'dup2_x1',
    'dup2_x2',
    'swap',
    ...['add', 'sub', 'mul', 'div', 'rem', 'neg'].flatMap((op) => ['i', 'l', 'f', 'd'].map((kind) => `${kind}${op}`)),
    'ishl',
    'lshl',
    'ishr',
    'lshr',
    'iushr',
    'lushr',
    'iand',
    'land',
    'ior',
    'lor',
    'ixor',
    'lxor',
    'iinc',
    'i2l',
    'i2f',
    'i2d',
    'l2i',
    'l2f',
    'l2d',
    'f2i',
    'f2l',
    'f2d',
    'd2i',
    'd2l',
    'd2f',
    'i2b',
    'i2c',
    'i2s',
    'lcmp',
    'fcmpl',
    'fcmpg',
    'dcmpl',
    'dcmpg',
    'ifeq',
    'ifne',
    'iflt',
    'ifge',
    'ifgt',
    'ifle',
    'if_icmpeq',
    'if_icmpne',
    'if_icmplt',
    'if_icmpge',
    'if_icmpgt',
    'if_icmple',
    'if_acmpeq',
    'if_acmpne',
    'goto',
    'jsr',
    'ret',
    'tableswitch',
    'lookupswitch',
    'ireturn',
    'lreturn',
    'freturn',
    'dreturn',
    'areturn',
    'return',
    'getstatic',
    'putstatic',
    'getfield',
    'putfield',
    'invokevirtual',
    'invokespecial',
    'invokestatic',
    'invokeinterface',
    'invokedynamic',
    'new',
    'newarray',
    'anewarray',
    'arraylength',
    'athrow',
    'checkcast',
    'instanceof',
    'monitorenter',
    'monitorexit',
    'wide',
    'multianewarray',
    'ifnull',
    'ifnonnull',
    'goto_w',
    'jsr_w'
];

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

/**
 * The byte length of the instruction at `pc`, operands included.
 *
 * @param code - A method's `Code` bytes.
 * @param pc - The offset of the instruction's opcode.
 */
export const instructionLength = (code: Uint8Array, pc: number): number => {
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const opcode = view.getUint8(pc);
    let length = 1 + (OPERAND_SIZE.get(opcode) ?? 0);
    if (opcode === OPCODES.TABLESWITCH || opcode === OPCODES.LOOKUPSWITCH) {
        // The operands start at the next multiple of four from the start of the code.
        const operands = (pc + 4) & ~3;
        if (opcode === OPCODES.TABLESWITCH) {
            const low = view.getInt32(operands + 4);
            const high = view.getInt32(operands + 8);
            if (high < low) throw new Error(`tableswitch at ${pc} has high ${high} below low ${low}`);
            length = operands + 12 + 4 * (high - low + 1) - pc;
        } else {
            const pairs = view.getInt32(operands + 4);
            if (pairs < 0) throw new Error(`lookupswitch at ${pc} has ${pairs} pairs`);
            length = operands + 8 + 8 * pairs - pc;
        }
    } else if (opcode === OPCODES.WIDE) length = view.getUint8(pc + 1) === OPCODES.IINC ? 6 : 4;
    // A length past the code's end would decode past it, or loop on a corrupt switch.
    if (pc + length > code.length) throw new Error(`the instruction at ${pc} runs past the end of the code`);
    return length;
};

/** `Owner.member` of a member reference, with the owner's binary name. */
const memberName = (ref: { readonly owner: string; readonly name: string }): string => `${ref.owner}.${ref.name}`;

/**
 * Decodes a method's code.
 *
 * @param owner - The class the code belongs to, whose constant pool its operands index.
 * @param code - The method's `Code` bytes.
 * @returns One instruction per opcode, in code order.
 */
export const decodeInstructions = (owner: JavaClass, code: Uint8Array): JavaInstruction[] => {
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const instructions: JavaInstruction[] = [];
    for (let pc = 0; pc < code.length; pc += instructionLength(code, pc)) {
        const opcode = view.getUint8(pc);
        instructions.push({ pc, opcode, ...operands(owner, view, pc, opcode) });
    }
    return instructions;
};

/** The resolved operands of the instruction at `pc`. */
const operands = (
    owner: JavaClass,
    view: DataView,
    pc: number,
    opcode: number
): Omit<JavaInstruction, 'pc' | 'opcode'> & { readonly opcode?: number } => {
    if (opcode >= OPCODES.ICONST_M1 && opcode <= OPCODES.ICONST_5) return { constant: opcode - OPCODES.ICONST_0 };
    const shorthand = WIDE_SHORTHAND_CONSTANTS.get(opcode);
    if (shorthand !== undefined) return { constant: shorthand };
    if (opcode === OPCODES.BIPUSH) return { constant: view.getInt8(pc + 1) };
    if (opcode === OPCODES.SIPUSH) return { constant: view.getInt16(pc + 1) };
    if (opcode === OPCODES.LDC || opcode === OPCODES.LDC_W || opcode === OPCODES.LDC2_W) {
        const index = opcode === OPCODES.LDC ? view.getUint8(pc + 1) : view.getUint16(pc + 1);
        const constant = owner.constant(index);
        const loads = owner.describeConstant(index);
        if (constant?.kind === 'number') return { constant: constant.value, loads };
        if (constant?.kind === 'string') return { constant: constant.value, loads };
        return { loads };
    }
    if (opcode >= OPCODES.GETSTATIC && opcode <= OPCODES.INVOKEINTERFACE) {
        const ref = owner.member(view.getUint16(pc + 1));
        return { member: memberName(ref), descriptor: ref.descriptor };
    }
    if (opcode === OPCODES.INVOKEDYNAMIC) {
        const index = view.getUint16(pc + 1);
        const bootstrap = owner.dynamicBootstrap(index);
        const site = owner.dynamicCallSite(index);
        const handles = (bootstrap?.arguments ?? []).flatMap((argument) => {
            const handle = owner.methodHandle(argument);
            return handle === undefined ? [] : [memberName(handle)];
        });
        return {
            handles,
            callSite: {
                name: site.name,
                descriptor: site.descriptor,
                bootstrap: bootstrap === undefined ? '' : memberName(bootstrap.method),
                arguments: (bootstrap?.arguments ?? []).map((argument) => owner.describeConstant(argument))
            }
        };
    }
    if (
        opcode === OPCODES.NEW ||
        opcode === OPCODES.ANEWARRAY ||
        opcode === OPCODES.CHECKCAST ||
        opcode === OPCODES.INSTANCEOF
    )
        return { type: owner.className(view.getUint16(pc + 1)) };
    if (opcode === OPCODES.MULTIANEWARRAY)
        return { type: owner.className(view.getUint16(pc + 1)), count: view.getUint8(pc + 3) };
    if (opcode === OPCODES.NEWARRAY) return { count: view.getUint8(pc + 1) };
    if ((opcode >= OPCODES.IFEQ && opcode <= OPCODES.JSR) || opcode === OPCODES.IFNULL || opcode === OPCODES.IFNONNULL)
        return { target: pc + view.getInt16(pc + 1) };
    if (opcode === OPCODES.GOTO_W || opcode === OPCODES.JSR_W) return { target: pc + view.getInt32(pc + 1) };
    if ((opcode >= 0x15 && opcode <= 0x19) || (opcode >= 0x36 && opcode <= 0x3a) || opcode === OPCODES.RET)
        return { local: view.getUint8(pc + 1) };
    // iload_0 to aload_3, four of each kind.
    if (opcode >= 0x1a && opcode <= 0x2d) return { local: (opcode - 0x1a) % 4 };
    // istore_0 to astore_3.
    if (opcode >= 0x3b && opcode <= 0x4e) return { local: (opcode - 0x3b) % 4 };
    if (opcode === OPCODES.IINC) return { local: view.getUint8(pc + 1), increment: view.getInt8(pc + 2) };
    if (opcode === OPCODES.WIDE) {
        const widened = view.getUint8(pc + 1);
        const local = view.getUint16(pc + 2);
        return widened === OPCODES.IINC
            ? { opcode: widened, local, increment: view.getInt16(pc + 4) }
            : { opcode: widened, local };
    }
    if (opcode === OPCODES.TABLESWITCH || opcode === OPCODES.LOOKUPSWITCH) {
        const at = (pc + 4) & ~3;
        const fallback = pc + view.getInt32(at);
        const cases: (readonly [number, number])[] = [];
        if (opcode === OPCODES.TABLESWITCH) {
            const low = view.getInt32(at + 4);
            const high = view.getInt32(at + 8);
            for (let key = low; key <= high; key++) cases.push([key, pc + view.getInt32(at + 12 + 4 * (key - low))]);
        } else {
            const pairs = view.getInt32(at + 4);
            for (let pair = 0; pair < pairs; pair++)
                cases.push([view.getInt32(at + 8 + 8 * pair), pc + view.getInt32(at + 12 + 8 * pair)]);
        }
        return { switch: { default: fallback, cases } };
    }
    return {};
};
