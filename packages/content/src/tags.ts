import type { Diagnostic } from './diagnostics';
import type { Holder } from './registry';
import type { Registry } from './registry';

/**
 * One entry in a tag file. A bare string is a required member; the object form
 * carries Java's `required` flag, and a member that is not required and has no
 * registry entry is dropped without a report.
 *
 * An id that starts with `#` names another tag, whose members are expanded in
 * place.
 */
export type TagMember = string | { id: string; required?: boolean };

/** One tag file contributed by one pack. */
export interface TagSource {
    /** The tag's namespaced id, written without the `#` a reference carries. */
    tag: string;
    /** The name of the pack the file came from. */
    pack: string;
    /** The file's path within the pack, for diagnostics. */
    path?: string;
    /**
     * Drop everything earlier packs put in this tag before adding `values`.
     * This is Java Edition's rule: a tag file appends unless it sets `replace`.
     */
    replace?: boolean;
    values: readonly TagMember[];
}

/**
 * The resolved members of one tag, as holders, so the set survives a registry
 * rebuild the same way a single {@link Holder} does.
 */
export interface HolderSet<T> extends Iterable<Holder<T>> {
    /** The tag's namespaced id, without a `#`. */
    readonly tag: string;
    /** Members in merge order, with tag references expanded and keys deduplicated. */
    readonly members: readonly Holder<T>[];
    /** Whether the set contains a registry key. */
    has(key: string): boolean;
    /** The values of the members the registry currently has, in merge order. */
    values(): readonly T[];
}

class TagSet<T> implements HolderSet<T> {
    private readonly keys: ReadonlySet<string>;

    public constructor(
        public readonly tag: string,
        public readonly members: readonly Holder<T>[]
    ) {
        this.keys = new Set(members.map((member) => member.key));
    }

    public has(key: string): boolean {
        return this.keys.has(key);
    }

    public values(): readonly T[] {
        const values: T[] = [];
        for (const member of this.members) {
            const value = member.get();
            if (value !== undefined) values.push(value);
        }
        return values;
    }

    public [Symbol.iterator](): IterableIterator<Holder<T>> {
        return this.members[Symbol.iterator]();
    }
}

/** One tag member after the stack is merged, with the file that contributed it. */
interface MergedMember {
    id: string;
    required: boolean;
    pack: string;
    path?: string;
}

const normalize = (member: TagMember, source: TagSource): MergedMember => {
    const entry = typeof member === 'string' ? { id: member } : member;
    return {
        id: entry.id,
        required: entry.required ?? true,
        pack: source.pack,
        ...(source.path ? { path: source.path } : {})
    };
};

/**
 * Records a finding. `dedupeKey` replaces the default key when two findings
 * describe the same problem in different words, as a tag cycle reported from
 * each tag on the loop does.
 */
type Report = (diagnostic: Diagnostic, dedupeKey?: string) => void;

/** Rotates a cycle so the same loop reported from two tags produces one key. */
const cycleKey = (path: readonly string[]): string => {
    let smallest = 0;
    for (let index = 1; index < path.length; index += 1) {
        if (path[index]! < path[smallest]!) smallest = index;
    }
    return [...path.slice(smallest), ...path.slice(0, smallest)].join('\u0000');
};

/**
 * Tag storage for one registry: the tag files of a whole pack stack merged,
 * resolved and indexed both ways.
 *
 * Build the registry first, then the tags, because resolution reports a
 * required member the registry does not have. Members stay holders, so a later
 * registry rebuild is visible through the same sets.
 */
export class Tags<T> {
    private sets = new Map<string, HolderSet<T>>();
    private reverse = new Map<string, string[]>();
    private report: readonly Diagnostic[] = [];

    /** @param registry - The registry whose keys the tags name. */
    public constructor(private readonly registry: Registry<T>) {}

    /** What the last {@link Tags.rebuild} reported, in report order. */
    public get diagnostics(): readonly Diagnostic[] {
        return this.report;
    }

    /**
     * Merges every tag file in stack order, then resolves tag references.
     *
     * A later file appends to the tag unless it sets `replace`, which drops
     * everything earlier packs contributed. A `#namespace:tag` member expands
     * to that tag's own members, transitively. A reference that closes a cycle
     * is dropped and reported as `tag.cycle` rather than thrown, so one bad
     * pack cannot stop a load.
     */
    public rebuild(sources: Iterable<TagSource>): void {
        const merged = new Map<string, MergedMember[]>();

        for (const source of sources) {
            const members = source.replace ? [] : (merged.get(source.tag) ?? []);
            merged.set(source.tag, members);

            const present = new Set(members.map((member) => member.id));
            for (const value of source.values) {
                const member = normalize(value, source);
                if (present.has(member.id)) continue;
                present.add(member.id);
                members.push(member);
            }
        }

        const diagnostics: Diagnostic[] = [];
        const seen = new Set<string>();
        const add: Report = (diagnostic, dedupeKey) => {
            const key = dedupeKey ?? [diagnostic.code, diagnostic.pack, diagnostic.message].join('\u0000');
            if (seen.has(key)) return;
            seen.add(key);
            diagnostics.push(diagnostic);
        };

        const sets = new Map<string, HolderSet<T>>();
        const reverse = new Map<string, string[]>();

        for (const tag of merged.keys()) {
            const keys = this.resolve(tag, merged, [], add);
            sets.set(
                tag,
                new TagSet(
                    tag,
                    keys.map((key) => this.registry.holder(key))
                )
            );
            for (const key of keys) {
                const owners = reverse.get(key) ?? [];
                reverse.set(key, owners);
                owners.push(tag);
            }
        }

        this.sets = sets;
        this.reverse = reverse;
        this.report = diagnostics;
    }

    /** The resolved set for a tag, or undefined when no pack declares it. */
    public get(tag: string): HolderSet<T> | undefined {
        return this.sets.get(tag);
    }

    /** Whether any pack declares the tag. */
    public has(tag: string): boolean {
        return this.sets.has(tag);
    }

    /** Every declared tag, in first-declaration order. */
    public names(): readonly string[] {
        return [...this.sets.keys()];
    }

    /** The tags that contain a registry key, in first-declaration order. */
    public tagsOf(key: string): readonly string[] {
        return this.reverse.get(key) ?? [];
    }

    /** Expands one tag into registry keys, dropping and reporting bad members. */
    private resolve(
        tag: string,
        merged: ReadonlyMap<string, MergedMember[]>,
        path: readonly string[],
        add: Report
    ): string[] {
        const keys: string[] = [];
        const present = new Set<string>();
        const walked = [...path, tag];

        for (const member of merged.get(tag) ?? []) {
            if (!member.id.startsWith('#')) {
                if (!this.registry.has(member.id)) {
                    if (!member.required) continue;
                    add({
                        severity: 'error',
                        code: 'tag.unknown-member',
                        pack: member.pack,
                        ...(member.path ? { path: member.path } : {}),
                        message: `tag ${tag} lists ${member.id}, which the ${this.registry.name} registry does not have`
                    });
                }
                if (!present.has(member.id)) {
                    present.add(member.id);
                    keys.push(member.id);
                }
                continue;
            }

            const referenced = member.id.slice(1);
            if (walked.includes(referenced)) {
                const loop = walked.slice(walked.indexOf(referenced));
                add(
                    {
                        severity: 'error',
                        code: 'tag.cycle',
                        pack: member.pack,
                        ...(member.path ? { path: member.path } : {}),
                        message: `tag reference cycle: ${[...loop, referenced].join(' -> ')}`
                    },
                    `tag.cycle\u0000${cycleKey(loop)}`
                );
                continue;
            }
            if (!merged.has(referenced)) {
                if (!member.required) continue;
                add({
                    severity: 'error',
                    code: 'tag.unknown-tag',
                    pack: member.pack,
                    ...(member.path ? { path: member.path } : {}),
                    message: `tag ${tag} references ${member.id}, which no pack declares`
                });
                continue;
            }

            for (const key of this.resolve(referenced, merged, walked, add)) {
                if (present.has(key)) continue;
                present.add(key);
                keys.push(key);
            }
        }

        return keys;
    }
}
