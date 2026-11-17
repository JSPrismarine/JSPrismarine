import type { ModuleHistory, ModuleVersion, Segment, ShapeDeclaration, ShapeMember } from './format.ts';

/** One declaration as a single version has it. */
export interface DeclarationShape {
    readonly name: string;
    readonly declaration: ShapeDeclaration;
    readonly members: ReadonlyMap<string, ShapeMember>;
}

/** The API one version of one module serves: its declarations by name, in the history's order. */
export interface ModuleShape {
    readonly module: string;
    readonly version: ModuleVersion;
    readonly declarations: ReadonlyMap<string, DeclarationShape>;
}

/**
 * Picks the segment that covers a version.
 * @param order - Each version's position in the history.
 */
const covering = <Value>(
    segments: readonly Segment<Value>[],
    position: number,
    order: ReadonlyMap<string, number>,
    newest: number
): Value | undefined => {
    const at = (version: string): number => {
        const index = order.get(version);
        if (index === undefined)
            throw new RangeError(`A segment names the version ${version}, which the history lacks`);
        return index;
    };
    for (const segment of segments) {
        const from = at(segment.from);
        const to = segment.to === undefined ? newest : at(segment.to);
        if (from <= position && position <= to) return withoutRange(segment);
    }
    return undefined;
};

/** A segment's value without its `from` and `to`. */
const withoutRange = <Value>(segment: Segment<Value>): Value => {
    const { from: _from, to: _to, ...value } = segment;
    // The rest of a `Segment<Value>` after its range is the `Value` it was built from, which the
    // compiler cannot see through a generic rest.
    return value as Value;
};

/**
 * Builds the API one version of a module serves from the module's history.
 * @throws {RangeError} When the history has no such version.
 */
export const shapeAt = (history: ModuleHistory, version: string): ModuleShape => {
    const position = history.versions.findIndex((entry) => entry.version === version);
    const entry = history.versions[position];
    if (entry === undefined) throw new RangeError(`${history.module} has no version ${version}`);
    const order = new Map(history.versions.map((each, index) => [each.version, index]));
    const newest = history.versions.length - 1;

    const declarations = new Map<string, DeclarationShape>();
    for (const [name, declarationHistory] of Object.entries(history.declarations)) {
        const declaration = covering(declarationHistory.segments, position, order, newest);
        if (declaration === undefined) continue;
        const members = new Map<string, ShapeMember>();
        for (const [member, segments] of Object.entries(declarationHistory.members ?? {})) {
            const value = covering(segments, position, order, newest);
            if (value !== undefined) members.set(member, value);
        }
        declarations.set(name, { name, declaration, members });
    }
    return { module: history.module, version: entry, declarations };
};

/**
 * The names a script's `import * as module` sees: every declaration but the interfaces, which
 * have no value at run time.
 */
export const exportNames = (shape: ModuleShape): string[] =>
    [...shape.declarations.values()]
        .filter((entry) => entry.declaration.kind !== 'interface')
        .map((entry) => entry.name);
