/**
 * Who a permission, an operator entry or a ban is about: the durable id of the platform the player
 * came from ([the permissions plan](../../../../docs/plans/permissions.md)).
 *
 * A Bedrock Dedicated Server save keys players by XUID and a Java save by the Mojang profile UUID,
 * and an offline-mode server has only the name a client typed. A subject carries which of the
 * three it holds, so a file section and a lookup can never mix an offline `Steve` with the Xbox
 * account named `Steve`. Every branch on a subject switches over `kind` and ends in a `never`
 * check, so adding a platform makes the compiler list each site to update.
 */

/** A player as one platform knows them. */
export type Subject =
    /** An Xbox Live account, by its XUID. */
    | { readonly kind: 'xbox'; readonly xuid: string }
    /** A Java Edition account, by its Mojang profile UUID. No login produces one yet. */
    | { readonly kind: 'java'; readonly uuid: string }
    /**
     * A player on an offline-mode server, by the name the client typed. `edition` marks a Java
     * Edition login, whose player is not the Bedrock player of the same name: the two keep their
     * own records and can play at once. Permission files ignore it, so an entry for an offline
     * name covers both editions.
     */
    | { readonly kind: 'offline'; readonly name: string; readonly edition?: 'java' };

/** The platforms a subject can come from. */
export type SubjectKind = Subject['kind'];

/** Every {@link SubjectKind}, in the order a file lists its sections. */
export const SUBJECT_KINDS = ['xbox', 'java', 'offline'] as const satisfies readonly SubjectKind[];

/** Compile-time proof that {@link SUBJECT_KINDS} names every kind. */
type EveryKindListed = [Exclude<SubjectKind, (typeof SUBJECT_KINDS)[number]>] extends [never] ? true : never;
true satisfies EveryKindListed;

/** Whether a string read from a file names a {@link SubjectKind}. */
export const isSubjectKind = (value: unknown): value is SubjectKind =>
    typeof value === 'string' && (SUBJECT_KINDS as readonly string[]).includes(value);

/**
 * The string a file keys this subject under inside its kind's section: the XUID, the UUID or the
 * name. No other module spells the layout; {@link parseSubject} is the reverse.
 * @param subject - The subject.
 * @returns The key.
 */
export const subjectKey = (subject: Subject): string => {
    switch (subject.kind) {
        case 'xbox':
            return subject.xuid;
        case 'java':
            return subject.uuid;
        case 'offline':
            return subject.name;
        default:
            return subject satisfies never;
    }
};

/**
 * The subject a file section and key name, the reverse of {@link subjectKey}.
 * @param kind - The section's kind.
 * @param key - The key under it.
 * @returns The subject, or undefined for an empty key.
 */
export const parseSubject = (kind: SubjectKind, key: string): Subject | undefined => {
    if (key === '') return undefined;
    switch (kind) {
        case 'xbox':
            return { kind, xuid: key };
        case 'java':
            return { kind, uuid: key };
        case 'offline':
            return { kind, name: key };
        default:
            return kind satisfies never;
    }
};

/**
 * Whether two subjects are the same player on the same platform. An offline `Steve` is never the
 * Xbox account named `Steve`.
 */
export const sameSubject = (a: Subject, b: Subject): boolean => a.kind === b.kind && subjectKey(a) === subjectKey(b);

/**
 * One string for both the kind and the key, for a `Map` key or a log line. It is not a file
 * layout and not the `xbox:Steve` form `/perms` accepts; those are spelled where they belong.
 */
export const subjectId = (subject: Subject): string => `${subject.kind} ${subjectKey(subject)}`;

/**
 * The subject of a login. A chain the server verified against Xbox Live gives the account's XUID;
 * any other login is an offline player known by name, whatever XUID the client claimed.
 * @param login - What the login carried and whether it was verified.
 * @returns The subject.
 */
export const loginSubject = (login: {
    readonly verified: boolean;
    readonly xuid: string;
    readonly name: string;
}): Subject =>
    login.verified && login.xuid !== '' ? { kind: 'xbox', xuid: login.xuid } : { kind: 'offline', name: login.name };
