/**
 * The load-time scan ADR 0022 asks for: which Script API members a pack's scripts name, and
 * how many of them JSPrismarine implements.
 *
 * It reads the source text, not what runs, so it counts a name that appears after a `.` or in
 * an import's braces and that some class or function of the pack's modules has. Two members of
 * different classes with one name count once, and implemented when any of them is.
 *
 * A name counts only as a member of a class the scripts can reach. The scan starts from the
 * declarations the scripts name, such as an imported `world`, and follows the types of the
 * members whose names appear anywhere in the text, since a callback can destructure its event: what a method returns, what a property holds, what a callback receives, and
 * the classes each of those extends or is extended by. A script that calls `server.levels` on
 * another API names no member that returns an `EnchantWithLevelsFunction`, so `levels` is not
 * taken for that class's property. The count is a guide for the server owner, never a gate.
 */
import type { ShapeType } from '../shape/format';
import { isPrimitiveType } from '../shape/format';
import type { DeclarationShape, ModuleShape } from '../shape/history';
import type { ScriptApiImplementations } from '../shape/implementations';

/** What a pack's scripts use of the API. */
export interface PackCoverage {
    /** Every member name the scripts use, sorted. */
    readonly used: readonly string[];
    /** The ones with an implementation. */
    readonly implemented: readonly string[];
    /** The ones without. */
    readonly missing: readonly string[];
}

/** A name after a dot, or a name inside an import's braces. */
const MEMBER_ACCESS = /\.\s*([A-Za-z_$][\w$]*)/g;
const IMPORT_NAMES = /import\s*\{([^}]*)\}/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/** A declaration of one of the pack's modules. */
interface Declared {
    readonly module: string;
    readonly shape: DeclarationShape;
}

/** The names the scripts write after a `.` or import by name, and every identifier they write. */
const namesIn = (scripts: ReadonlyMap<string, string>): { named: Set<string>; words: Set<string> } => {
    const named = new Set<string>();
    const words = new Set<string>();
    for (const source of scripts.values()) {
        for (const [word] of source.matchAll(IDENTIFIER)) words.add(word);
        for (const match of source.matchAll(MEMBER_ACCESS)) if (match[1] !== undefined) named.add(match[1]);
        for (const match of source.matchAll(IMPORT_NAMES)) {
            for (const part of (match[1] ?? '').split(',')) {
                const name = part.trim().split(/\s+as\s+/)[0];
                if (name !== undefined && name !== '') named.add(name);
            }
        }
    }
    return { named, words };
};

/**
 * The declarations of the pack's modules a script can hold a value of, given the names it uses.
 * @param named - Every identifier the scripts write.
 * @param shapes - The module versions the pack is served.
 */
const reachableDeclarations = (named: ReadonlySet<string>, shapes: readonly ModuleShape[]): Set<Declared> => {
    const byModule = new Map(shapes.map((shape) => [shape.module, shape]));
    const lookup = (module: string, name: string): Declared | undefined => {
        const shape = byModule.get(module)?.declarations.get(name);
        return shape === undefined ? undefined : { module, shape };
    };
    /** Each declaration's subclasses, since a member typed as a base hands out its subclasses' objects. */
    const subclasses = new Map<DeclarationShape, Declared[]>();
    for (const shape of shapes) {
        for (const declared of shape.declarations.values()) {
            const { declaration } = declared;
            if (declaration.kind !== 'class' && declaration.kind !== 'interface') continue;
            const base =
                typeof declaration.base === 'string'
                    ? lookup(shape.module, declaration.base)
                    : declaration.base && lookup(declaration.base.module, declaration.base.name);
            if (base !== undefined)
                subclasses.set(base.shape, [
                    ...(subclasses.get(base.shape) ?? []),
                    { module: shape.module, shape: declared }
                ]);
        }
    }

    const reached = new Set<DeclarationShape>();
    const result = new Set<Declared>();
    const queue: Declared[] = [];
    const reach = (declared: Declared | undefined): void => {
        if (declared === undefined || reached.has(declared.shape)) return;
        reached.add(declared.shape);
        result.add(declared);
        queue.push(declared);
    };
    /**
     * Reaches every declaration a type names. `received` reaches only what a callback inside the
     * type is handed, for an argument the script passes in, and looks into an interface's members
     * there, since a script writes those as an object literal's keys rather than after a dot.
     */
    const visit = (type: ShapeType, module: string, received: boolean, seen = new Set<ShapeType>()): void => {
        if (seen.has(type)) return;
        seen.add(type);
        if (typeof type === 'string') {
            if (isPrimitiveType(type)) return;
            const declared = lookup(module, type);
            if (declared === undefined) return;
            if (!received) return reach(declared);
            if (declared.shape.declaration.kind !== 'interface') return;
            for (const member of declared.shape.members.values())
                if (member.kind === 'property') visit(member.type, module, true, seen);
            return;
        }
        switch (type.kind) {
            case 'external':
                if (received) return;
                return reach(lookup(type.module, type.name));
            case 'optional':
            case 'promise':
                return visit(type.type, module, received, seen);
            case 'variant':
                for (const each of type.types) visit(each, module, received, seen);
                return;
            case 'array':
                return visit(type.element, module, received, seen);
            case 'map':
                return visit(type.value, module, received, seen);
            case 'closure':
                // What a callback receives is what the script holds; what it returns goes back in.
                for (const each of type.arguments) visit(each, module, false, seen);
                return;
            case 'generator':
            case 'number':
                return;
            case 'script':
                // Text such as `EntityComponentReturnType<T>`, which stands for the `EntityComponent` subclass the id names.
                if (received) return;
                for (const [word] of type.text.matchAll(IDENTIFIER))
                    reach(lookup(module, word) ?? lookup(module, word.replace(/ReturnType$/, '')));
        }
    };

    for (const shape of shapes)
        for (const name of named) {
            const declared = lookup(shape.module, name);
            if (declared?.shape.declaration.kind === 'interface') continue;
            reach(declared);
        }
    for (let declared = queue.shift(); declared !== undefined; declared = queue.shift()) {
        const { module, shape } = declared;
        const { declaration } = shape;
        for (const subclass of subclasses.get(shape) ?? []) reach(subclass);
        if (declaration.kind === 'class' || declaration.kind === 'interface') {
            if (typeof declaration.base === 'string') reach(lookup(module, declaration.base));
            else if (declaration.base !== undefined) reach(lookup(declaration.base.module, declaration.base.name));
        }
        if (declaration.kind === 'object') visit(declaration.type, module, false);
        if (declaration.kind === 'class' && declaration.iterator !== undefined)
            visit(declaration.iterator.type, module, false);
        if (declaration.kind === 'function') {
            visit(declaration.returns, module, false);
            for (const argument of declaration.arguments) visit(argument.type, module, true);
        }
        for (const [name, member] of shape.members) {
            if (!named.has(name) && member.kind !== 'constructor') continue;
            if (member.kind === 'property') visit(member.type, module, false);
            if (member.kind === 'method') visit(member.returns, module, false);
            if (member.kind === 'method' || member.kind === 'constructor')
                for (const argument of member.arguments) visit(argument.type, module, true);
        }
    }
    return result;
};

/**
 * Scans a pack's scripts.
 * @param scripts - The text of each script file.
 * @param shapes - The module versions the pack is served.
 * @param implementations - The pack's implementations.
 */
export const scanCoverage = (
    scripts: ReadonlyMap<string, string>,
    shapes: readonly ModuleShape[],
    implementations: ScriptApiImplementations
): PackCoverage => {
    const { named, words } = namesIn(scripts);
    /** Each member name, with every reachable place it is declared. */
    const members = new Map<string, Array<{ module: string; owner: string }>>();
    const declare = (name: string, module: string, owner: string): void => {
        if (!named.has(name)) return;
        const places = members.get(name) ?? [];
        places.push({ module, owner });
        members.set(name, places);
    };
    for (const { module, shape } of reachableDeclarations(words, shapes)) {
        const { name, declaration, members: classMembers } = shape;
        if (declaration.kind === 'function') declare(name, module, '');
        if (declaration.kind !== 'class') continue;
        for (const [member, value] of classMembers) if (value.kind !== 'constant') declare(member, module, name);
    }

    const used = [...members.keys()].sort();
    const isImplemented = (name: string): boolean =>
        (members.get(name) ?? []).some(({ module, owner }) => implementations.find(module, owner, name) !== undefined);
    return {
        used,
        implemented: used.filter(isImplemented),
        missing: used.filter((name) => !isImplemented(name))
    };
};
