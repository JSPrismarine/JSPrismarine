/**
 * How `ops.json` and `banned-players.json` spell a subject on one entry: a `kind` and an `id`
 * beside the entry's other fields. `permissions.json` files subjects under a section per kind
 * instead, and reads them with `parseSubject` directly.
 */
import type { Subject } from '../identity/Subject';
import { isSubjectKind, parseSubject, subjectKey } from '../identity/Subject';
import { isRecord } from '../utils/isRecord';
import type { SubjectEntry } from './JsonConfigTypes';

/** The subject an entry's `kind` and `id` name, or undefined when it has none or they do not parse. */
export const subjectOfEntry = (entry: unknown): Subject | undefined => {
    if (!isRecord(entry) || !isSubjectKind(entry.kind) || typeof entry.id !== 'string') return undefined;
    return parseSubject(entry.kind, entry.id);
};

/** The `kind` and `id` an entry carries for a subject. */
export const subjectEntryOf = (subject: Subject): SubjectEntry => ({ kind: subject.kind, id: subjectKey(subject) });
