/**
 * The load-time scan ADR 0022 asks for: which Script API members a pack's scripts name, and
 * how many of them JSPrismarine implements.
 *
 * It reads the source text, not what runs, so it counts a name that appears after a `.` or in
 * an import's braces and that some class or function of the pack's modules has. Two members of
 * different classes with one name count once, and implemented when any of them is. The count is
 * a guide for the server owner, never a gate.
 */
import type { ModuleShape } from '../shape/history';
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
    /** Each member name, with every place it is declared. */
    const members = new Map<string, Array<{ module: string; owner: string }>>();
    const declare = (name: string, module: string, owner: string): void => {
        const places = members.get(name) ?? [];
        places.push({ module, owner });
        members.set(name, places);
    };
    for (const shape of shapes) {
        for (const { name, declaration, members: classMembers } of shape.declarations.values()) {
            if (declaration.kind === 'function') declare(name, shape.module, '');
            if (declaration.kind !== 'class') continue;
            for (const [member, value] of classMembers)
                if (value.kind !== 'constant') declare(member, shape.module, name);
        }
    }

    const named = new Set<string>();
    for (const source of scripts.values()) {
        for (const match of source.matchAll(MEMBER_ACCESS)) if (match[1] !== undefined) named.add(match[1]);
        for (const match of source.matchAll(IMPORT_NAMES)) {
            for (const part of (match[1] ?? '').split(',')) {
                const name = part.trim().split(/\s+as\s+/)[0];
                if (name !== undefined && name !== '') named.add(name);
            }
        }
    }

    const used = [...named].filter((name) => members.has(name)).sort();
    const isImplemented = (name: string): boolean =>
        (members.get(name) ?? []).some(({ module, owner }) => implementations.find(module, owner, name) !== undefined);
    return {
        used,
        implemented: used.filter(isImplemented),
        missing: used.filter((name) => !isImplemented(name))
    };
};
