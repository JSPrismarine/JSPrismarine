import { describe, expect, it } from 'vitest';

import { parseConfigDocument } from '../config/ConfigDocument';
import { migrateDocument } from '../config/FileMigrations';
import { DEFAULT_GROUP, OPERATOR_GROUP } from './model';
import {
    DEFAULT_PLAYER_PERMISSIONS,
    PERMISSIONS_MIGRATIONS,
    PERMISSIONS_SCHEMA_VERSION,
    VERSION_3_DEFAULT_PERMISSIONS
} from './PermissionsFile';

const [LINK, UNLINK] = VERSION_3_DEFAULT_PERMISSIONS;

/** A version 2 file with these `default` nodes and a `vip` group. */
const version2 = (defaultNodes: readonly string[]): string =>
    JSON.stringify({
        schemaVersion: 2,
        groups: {
            [DEFAULT_GROUP]: { weight: 0, parents: [], nodes: defaultNodes.map((node) => ({ node })), meta: {} },
            vip: { weight: 10, parents: [], nodes: [{ node: 'minecraft.command.me' }], meta: {} },
            [OPERATOR_GROUP]: { weight: 100, parents: [], nodes: [{ node: '*' }], meta: {} }
        },
        users: { xbox: {}, java: {}, offline: {} }
    });

/** The nodes a migrated document's group holds, in file order. */
const nodesOf = (text: string, group: string): unknown => {
    const document = migrateDocument(PERMISSIONS_MIGRATIONS, parseConfigDocument(text)).document;
    const nodes = document.get(['groups', group, 'nodes']);
    return Array.isArray(nodes) ? nodes.map((entry: { node?: unknown }) => entry.node) : nodes;
};

describe('permissions.json migrations', () => {
    it('gives a fresh file the version 3 nodes, so a fresh file and a migrated one agree', () => {
        expect(DEFAULT_PLAYER_PERMISSIONS).toEqual(expect.arrayContaining([...VERSION_3_DEFAULT_PERMISSIONS]));
    });

    it("adds the link nodes after a version 2 file's own default nodes", () => {
        expect(nodesOf(version2(['minecraft.command.help']), DEFAULT_GROUP)).toEqual([
            'minecraft.command.help',
            LINK,
            UNLINK
        ]);
    });

    it('does not duplicate a link node the group already grants or negates', () => {
        expect(nodesOf(version2([LINK, `-${UNLINK}`]), DEFAULT_GROUP)).toEqual([LINK, `-${UNLINK}`]);
    });

    it('leaves every other group as it was', () => {
        expect(nodesOf(version2([]), 'vip')).toEqual(['minecraft.command.me']);
        expect(nodesOf(version2([]), OPERATOR_GROUP)).toEqual(['*']);
    });

    it('leaves a file without a default group without one, which reads as a fresh one', () => {
        const text = JSON.stringify({ schemaVersion: 2, groups: { vip: { nodes: [] } }, users: {} });

        const { document } = migrateDocument(PERMISSIONS_MIGRATIONS, parseConfigDocument(text));

        expect(document.has(['groups', DEFAULT_GROUP])).toBe(false);
    });

    it('takes a file without schemaVersion through the version 1 layout and then adds the link nodes', () => {
        const legacy = JSON.stringify({ defaultPermissions: ['minecraft.command.help'], players: [] });

        const migrated = migrateDocument(PERMISSIONS_MIGRATIONS, parseConfigDocument(legacy));

        expect([migrated.from, migrated.to]).toEqual([1, PERMISSIONS_SCHEMA_VERSION]);
        expect(migrated.document.get(['schemaVersion'])).toBe(PERMISSIONS_SCHEMA_VERSION);
        expect(nodesOf(legacy, DEFAULT_GROUP)).toEqual(['minecraft.command.help', LINK, UNLINK]);
    });

    it('runs once: a migrated file is at the current version and a second run changes nothing', () => {
        const once = migrateDocument(PERMISSIONS_MIGRATIONS, parseConfigDocument(version2([]))).document.toString();

        const again = migrateDocument(PERMISSIONS_MIGRATIONS, parseConfigDocument(once));

        expect(again.from).toBe(PERMISSIONS_SCHEMA_VERSION);
        expect(again.document.toString()).toBe(once);
    });
});
