import { describe, expect, it } from 'vitest';

import type { Subject, SubjectKind } from './Subject';
import {
    isSubjectKind,
    loginSubject,
    parseSubject,
    sameSubject,
    SUBJECT_KINDS,
    subjectId,
    subjectKey
} from './Subject';

/**
 * Compiles only while every kind has a case: a kind added to {@link Subject} without one here makes
 * `subject` something other than `never` in the default branch, and `pnpm run typecheck` fails on
 * this file. That is the check the plan asks for, so the switch stays as it is.
 */
const platformOf = (subject: Subject): string => {
    switch (subject.kind) {
        case 'xbox':
            return 'Xbox Live';
        case 'java':
            return 'Java Edition';
        case 'offline':
            return 'offline';
        default:
            return subject satisfies never;
    }
};

describe('Subject', () => {
    const steve: Subject = { kind: 'xbox', xuid: '2535400000000001' };
    const notch: Subject = { kind: 'java', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' };
    const alex: Subject = { kind: 'offline', name: 'Alex' };

    it('keys a subject by the id of its platform, and parses the key back', () => {
        for (const subject of [steve, notch, alex]) {
            expect(parseSubject(subject.kind, subjectKey(subject))).toEqual(subject);
        }
        expect(subjectKey(steve)).toBe('2535400000000001');
        expect(subjectKey(alex)).toBe('Alex');
        expect(parseSubject('offline', '')).toBeUndefined();
    });

    it('lists every kind once, as a file orders its sections', () => {
        const kinds: readonly SubjectKind[] = SUBJECT_KINDS;
        expect(new Set(kinds).size).toBe(kinds.length);
        for (const kind of kinds) expect(isSubjectKind(kind)).toBe(true);
        expect(isSubjectKind('bedrock')).toBe(false);
        expect(isSubjectKind(7)).toBe(false);
    });

    it('never takes an offline player for the account of the same name', () => {
        const offlineSteve: Subject = { kind: 'offline', name: '2535400000000001' };
        expect(sameSubject(steve, { kind: 'xbox', xuid: '2535400000000001' })).toBe(true);
        expect(sameSubject(steve, offlineSteve)).toBe(false);
        expect(subjectId(steve)).not.toBe(subjectId(offlineSteve));
    });

    it('gives a verified login its XUID and any other login its name', () => {
        expect(loginSubject({ verified: true, xuid: '2535400000000001', name: 'Steve' })).toEqual(steve);
        // An offline-mode server reads whatever XUID the client wrote, so it is not the key.
        expect(loginSubject({ verified: false, xuid: '2535400000000001', name: 'Steve' })).toEqual({
            kind: 'offline',
            name: 'Steve'
        });
        expect(loginSubject({ verified: true, xuid: '', name: 'Steve' })).toEqual({ kind: 'offline', name: 'Steve' });
    });

    it('switches over every kind', () => {
        expect([steve, notch, alex].map(platformOf)).toEqual(['Xbox Live', 'Java Edition', 'offline']);
    });
});
