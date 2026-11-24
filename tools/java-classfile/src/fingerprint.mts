import { createHash } from 'node:crypto';

import type { JavaClass, JavaCodeMethod } from './classFile.mts';
import { ACC_PRIVATE, ACC_SYNCHRONIZED, ACC_SYNTHETIC } from './classFile.mts';
import type { JavaInstruction } from './instructions.mts';
import { MNEMONICS, OPCODES, decodeInstructions } from './instructions.mts';

/**
 * A normalized listing of one Java method or field, and its fingerprint.
 *
 * The listing keeps what the code does and drops what compiling the same source again can change:
 * constant pool indices become the symbols they name, branch targets become instruction indices,
 * and the line, local variable and stack map tables are left out. The synthetic lambdas and the
 * private methods of the same class that a method reaches are listed after it, because a private
 * helper is part of the method in every way a copy of it cares about. `javac` numbers lambdas
 * across the whole class, so each one is renamed `lambda#N` by the order the listing first meets
 * it. Calls into other classes stay names only.
 */

/** One Java method or field, resolved to its class. */
export interface JavaSourceMember {
    /** The owner's binary name, such as `net/minecraft/world/level/block/SpongeBlock`. */
    readonly owner: string;
    readonly name: string;
    /** The method's descriptor; absent for a field. */
    readonly descriptor?: string;
}

/** A reason a member cannot be listed. */
export class JavaSourceError extends Error {}

/** The member as a fingerprint golden keys it: `owner.name(descriptor)` for a method, `owner.name` for a field. */
export const javaSourceKey = (member: JavaSourceMember): string =>
    `${member.owner}.${member.name}${member.descriptor ?? ''}`;

/** The method a class declares with a name and descriptor. */
const declared = (owner: JavaClass, name: string, descriptor: string): JavaCodeMethod | undefined =>
    owner.methods.find((method) => method.name === name && method.descriptor === descriptor);

/** Whether a method of the class is listed with the method that reaches it. */
const inlined = (method: JavaCodeMethod): boolean =>
    (method.access & ACC_PRIVATE) !== 0 || (method.access & ACC_SYNTHETIC) !== 0 || method.name.startsWith('lambda$');

/** The member names a decoded instruction refers to, as `owner.name descriptor` pairs. */
const referencedMembers = (instruction: JavaInstruction): { owner: string; name: string; descriptor: string }[] => {
    const found: { owner: string; name: string; descriptor: string }[] = [];
    if (instruction.member !== undefined && instruction.descriptor !== undefined) {
        const dot = instruction.member.lastIndexOf('.');
        found.push({
            owner: instruction.member.slice(0, dot),
            name: instruction.member.slice(dot + 1),
            descriptor: instruction.descriptor
        });
    }
    // A handle argument reads `handle owner.name(descriptor)`, as `describeConstant` writes it.
    // A handle argument reads `handle kind owner.name(descriptor)`, as `describeConstant` writes it.
    for (const argument of instruction.callSite?.arguments ?? []) {
        if (!argument.startsWith('handle ')) continue;
        const reference = argument.slice(argument.indexOf(' ', 'handle '.length) + 1);
        const paren = reference.indexOf('(');
        const dot = reference.lastIndexOf('.', paren);
        if (paren < 0 || dot < 0) continue;
        found.push({
            owner: reference.slice(0, dot),
            name: reference.slice(dot + 1, paren),
            descriptor: reference.slice(paren)
        });
    }
    return found;
};

/** One block of the listing: a header and the code it lists. */
interface Block {
    readonly header: string;
    readonly instructions: readonly JavaInstruction[];
    readonly method: JavaCodeMethod | undefined;
}

/**
 * The normalized listing of a method or field.
 *
 * @param load - Reads a class of the jar by binary name.
 * @param member - The method or field.
 * @returns One line per instruction, with a header line per listed method.
 * @throws {JavaSourceError} When the class or member is missing, or a field has no value to list.
 */
export const javaSourceListing = (
    load: (binaryName: string) => JavaClass | undefined,
    member: JavaSourceMember
): string[] => {
    const owner = load(member.owner);
    if (owner === undefined) throw new JavaSourceError(`the jar holds no class ${member.owner}`);

    const blocks: Block[] = [];
    const aliases = new Map<string, string>();
    const queued = new Set<string>();
    const queue: JavaCodeMethod[] = [];

    /** Queues the same-class helpers an instruction reaches, naming lambdas in the order they are met. */
    const follow = (instructions: readonly JavaInstruction[]): void => {
        for (const instruction of instructions)
            for (const ref of referencedMembers(instruction)) {
                if (ref.owner !== owner.name) continue;
                const method = declared(owner, ref.name, ref.descriptor);
                const key = `${ref.name}${ref.descriptor}`;
                if (method === undefined || !inlined(method) || queued.has(key)) continue;
                queued.add(key);
                if (method.name.startsWith('lambda$') && !aliases.has(method.name))
                    aliases.set(method.name, `lambda#${aliases.size}`);
                queue.push(method);
            }
    };

    if (member.descriptor === undefined) {
        const field = owner.fields.find((candidate) => candidate.name === member.name);
        if (field === undefined) throw new JavaSourceError(`${owner.name} declares no field ${member.name}`);
        if (field.constantValue !== undefined)
            return [`field ${owner.name}.${field.name} ${field.descriptor} = ${field.constantValue}`];

        // A static field the static initializer sets lists the whole initializer. A value can be
        // left on the stack across another field's store, or stored twice, so no slice of the
        // initializer is sure to hold everything that decides it; the cost is that a change to
        // any other static field of the class changes this fingerprint too.
        const clinit = owner.methods.find((method) => method.name === '<clinit>');
        const instructions = clinit?.code === undefined ? [] : decodeInstructions(owner, clinit.code);
        const stored = instructions.some(
            (instruction) =>
                instruction.opcode === OPCODES.PUTSTATIC && instruction.member === `${owner.name}.${field.name}`
        );
        if (clinit === undefined || !stored)
            throw new JavaSourceError(
                `${owner.name}.${field.name} has no constant value and no static initializer; tag the method that sets it`
            );
        blocks.push({
            header: `field ${owner.name}.${field.name} ${field.descriptor}`,
            instructions: [],
            method: undefined
        });
        queued.add('<clinit>()V');
        queue.push(clinit);
    } else {
        const method = declared(owner, member.name, member.descriptor);
        if (method === undefined)
            throw new JavaSourceError(`${owner.name} declares no method ${member.name}${member.descriptor}`);
        queued.add(`${method.name}${method.descriptor}`);
        queue.push(method);
    }

    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const instructions = next.code === undefined ? [] : decodeInstructions(owner, next.code);
        follow(instructions);
        const name = aliases.get(next.name) ?? next.name;
        const kind = blocks.length === 0 ? 'method' : 'inlined';
        // A synchronized method takes a monitor its instructions do not show.
        const flags = (next.access & ACC_SYNCHRONIZED) === 0 ? '' : ' synchronized';
        blocks.push({ header: `${kind} ${owner.name}.${name}${next.descriptor}${flags}`, instructions, method: next });
    }

    const rename = (line: string): string =>
        line.replace(/(\.)(lambda\$[\w$]+)(?=[\s(]|$)/g, (whole, dot: string, name: string) => {
            const alias = aliases.get(name);
            return alias === undefined ? whole : `${dot}${alias}`;
        });

    return blocks.flatMap((block) => [block.header, ...listBlock(block).map(rename)]);
};

/** One block's instructions and exception handlers as listing lines, with targets as instruction indices. */
const listBlock = (block: Block): string[] => {
    const indexOf = new Map(block.instructions.map((instruction, index) => [instruction.pc, index]));
    const label = (pc: number): string => {
        const index = indexOf.get(pc);
        // An exception range may end at the code's length, one past the last instruction.
        return index === undefined ? (pc > (block.instructions.at(-1)?.pc ?? 0) ? 'Lend' : 'L?') : `L${index}`;
    };
    const lines = block.instructions.map((instruction, index) => `  ${index}: ${render(instruction, label)}`);
    for (const handler of block.method?.exceptionTable ?? [])
        lines.push(
            `  try ${label(handler.start)} ${label(handler.end)} ${label(handler.handler)} ${handler.catchType ?? 'any'}`
        );
    return lines;
};

/** One instruction as a listing line, without its offset. */
const render = (instruction: JavaInstruction, label: (pc: number) => string): string => {
    const { opcode } = instruction;
    // `ldc_w` is `ldc` with a constant pool index past 255, which a reordered pool can change.
    const mnemonic = opcode === OPCODES.LDC_W ? 'ldc' : MNEMONICS[opcode];
    const parts = [mnemonic ?? `op${opcode}`];
    if (opcode === OPCODES.BIPUSH || opcode === OPCODES.SIPUSH) parts.push(String(instruction.constant));
    if (instruction.loads !== undefined) parts.push(instruction.loads);
    if (instruction.member !== undefined) parts.push(instruction.member, instruction.descriptor ?? '');
    if (instruction.callSite !== undefined) {
        const site = instruction.callSite;
        parts.push(site.name, site.descriptor, site.bootstrap, `[${site.arguments.join(', ')}]`);
    }
    if (instruction.type !== undefined) parts.push(instruction.type);
    if (instruction.count !== undefined) parts.push(String(instruction.count));
    if (instruction.local !== undefined && (opcode < 0x1a || opcode > 0x2d) && (opcode < 0x3b || opcode > 0x4e))
        parts.push(String(instruction.local));
    if (instruction.increment !== undefined) parts.push(String(instruction.increment));
    if (instruction.target !== undefined) parts.push(label(instruction.target));
    if (instruction.switch !== undefined)
        parts.push(
            `default ${label(instruction.switch.default)}`,
            ...instruction.switch.cases.map(([key, target]) => `${key}: ${label(target)}`)
        );
    return parts.join(' ');
};

/**
 * The fingerprint of a listing: a SHA-256 of its lines.
 *
 * @param listing - A listing from {@link javaSourceListing}.
 * @returns `sha256:` and the hex digest.
 */
export const javaSourceFingerprint = (listing: readonly string[]): string =>
    `sha256:${createHash('sha256').update(listing.join('\n')).digest('hex')}`;
