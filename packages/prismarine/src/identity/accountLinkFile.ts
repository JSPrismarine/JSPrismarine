/**
 * `account-links.json`: the links between accounts, kept beside the ban list and the permissions.
 *
 * ```json
 * { "links": [{ "account": { "kind": "java", "id": "<uuid>" }, "primary": { "kind": "xbox", "id": "<xuid>" }, "name": "Steve", "xuid": "<xuid>" }] }
 * ```
 */
import fs from 'node:fs';

import { readJsonFile, writeJsonFile } from '../config/JsonFile';
import { subjectEntryOf, subjectOfEntry } from '../config/subjectEntry';
import { isRecord } from '../utils/isRecord';
import type { AccountLink, AccountLinkStore } from './AccountLinks';

/** The file's name in the server's directory. */
export const ACCOUNT_LINKS_FILE = 'account-links.json';

const linkOf = (entry: unknown): AccountLink | undefined => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.xuid !== 'string') return undefined;
    const account = subjectOfEntry(entry.account);
    const primary = subjectOfEntry(entry.primary);
    if (account === undefined || primary === undefined) return undefined;
    return { account, primary, primaryName: entry.name, primaryXuid: entry.xuid };
};

/**
 * The links kept in a file.
 * @param path - The file, which a first save creates.
 * @returns The store.
 */
export const accountLinkFile = (path: string): AccountLinkStore => ({
    load: async () => {
        if (!fs.existsSync(path)) return [];
        const links = (await readJsonFile(path, '{}')).get(['links']);
        return Array.isArray(links) ? links.flatMap((entry: unknown) => linkOf(entry) ?? []) : [];
    },
    save: async (links) => {
        const document = await readJsonFile(path, '{}');
        document.set(
            ['links'],
            links.map((link) => ({
                account: subjectEntryOf(link.account),
                primary: subjectEntryOf(link.primary),
                name: link.primaryName,
                xuid: link.primaryXuid
            }))
        );
        await writeJsonFile(path, document);
    }
});
