import type {
    ChunkEntry,
    EntityId,
    FieldEntry,
    FieldKey,
    FieldKind,
    MembershipEntry,
    OccurrenceEntry
} from './ChangeEntry';
import { fieldKey } from './ChangeEntry';
import type { SealedTick } from './ChangeLog';

/** The field kinds other than entity fields, which {@link CoalescedTick.entities} groups by entity. */
type OtherFieldKind = Exclude<FieldKind, 'entity'>;

/**
 * One tick's changes as a reader needs them: the final value of every changed field, and the
 * entries that are not field writes, each kind in the order its entries happened. The order
 * between two kinds is not kept, such as an animation before the removal of its entity, so a
 * reader that needs it reads the sealed tick's entries, as the replicas do.
 *
 * Coalescing is a reader's concern. The log keeps every write, so a span can be inverted, and
 * this view keeps only the last write to each field. It does not reconcile fields with
 * membership: an entity that entered this tick appears in `memberships` with the saved form it
 * entered with, and in `entities` with any field written after that.
 */
export type CoalescedTick = {
    /** The tick these changes belong to. */
    readonly tick: number;
    /**
     * The last write to each entity field, by entity and then by field name, in the order each
     * entity and field was first written.
     */
    readonly entities: ReadonlyMap<EntityId, ReadonlyMap<string, FieldEntry<'entity'>>>;
    /**
     * The last write to each field of the other kinds, by kind and then by {@link fieldKey}. A
     * kind with no writes is absent.
     */
    readonly fields: { readonly [K in OtherFieldKind]?: ReadonlyMap<FieldKey, FieldEntry<K>> };
    /** Entities that entered or left, in order. */
    readonly memberships: readonly MembershipEntry[];
    /** Chunks that entered or left, in order. */
    readonly chunks: readonly ChunkEntry[];
    /** One-shot occurrences, in order. */
    readonly occurrences: readonly OccurrenceEntry[];
};

type FieldMaps = { [K in OtherFieldKind]?: Map<FieldKey, FieldEntry<K>> };

/**
 * Reads a sealed tick once into the view replication needs, so a reader that serves many
 * viewers scans the tick's entries once and not once per viewer.
 * @param {SealedTick} sealed - The tick to read.
 * @returns {CoalescedTick} The final value per field and the ordered non-field entries.
 */
export function coalesceTick(sealed: SealedTick): CoalescedTick {
    const entities = new Map<EntityId, Map<string, FieldEntry<'entity'>>>();
    const fields: FieldMaps = {};
    const memberships: MembershipEntry[] = [];
    const chunks: ChunkEntry[] = [];
    const occurrences: OccurrenceEntry[] = [];

    for (const entry of sealed.entries) {
        switch (entry.kind) {
            case 'field':
                if (entry.field === 'entity') {
                    let byField = entities.get(entry.address.entity);
                    if (!byField) entities.set(entry.address.entity, (byField = new Map()));
                    byField.set(entry.address.field, entry);
                } else keepLast(fields, entry.field, entry);
                break;
            case 'membership':
                memberships.push(entry);
                break;
            case 'chunk':
                chunks.push(entry);
                break;
            case 'occurrence':
                occurrences.push(entry);
                break;
        }
    }

    return { tick: sealed.tick, entities, fields, memberships, chunks, occurrences };
}

function keepLast<K extends OtherFieldKind>(fields: FieldMaps, kind: K, entry: FieldEntry<K>): void {
    let map: FieldMaps[K] = fields[kind];
    if (!map) {
        map = new Map();
        fields[kind] = map;
    }
    const byKey: Map<FieldKey, FieldEntry<K>> = map;
    byKey.set(fieldKey(entry), entry);
}
