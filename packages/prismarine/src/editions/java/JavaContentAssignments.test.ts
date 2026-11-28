import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JavaContentAssignments, javaItemBaseOf } from './JavaContentAssignments';

let scratch: string;
beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-java-content-'));
});
afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

const none = new Map<string, unknown>();

describe('JavaContentAssignments', () => {
    it('assigns an item once, and gives it the same assignment after a restart', async () => {
        const file = path.join(scratch, 'java-content.json');
        const first = new JavaContentAssignments(file, { info: () => {} });
        await first.load();
        const lamp = first.assignItem('loopback:Magic Lamp', none);
        expect(lamp).toEqual({ model: 'loopback:magic_lamp', base: 'minecraft:paper' });
        expect(first.assignItem('loopback:Magic Lamp', new Map([['minecraft:shooter', {}]]))).toBe(lamp);
        await first.save();

        const restarted = new JavaContentAssignments(file, { info: () => {} });
        await restarted.load();
        expect(restarted.item('loopback:Magic Lamp')).toEqual(lamp);
    });

    it('gives an item whose key another holds a numbered key of its own', async () => {
        const assignments = new JavaContentAssignments(path.join(scratch, 'java-content.json'), { info: () => {} });
        await assignments.load();
        expect(assignments.assignItem('loopback:lamp', none).model).toBe('loopback:lamp');
        expect(assignments.assignItem('loopback:LAMP', none).model).toBe('loopback:lamp_2');
        expect(assignments.assignItem('loopback:Lamp', none).model).toBe('loopback:lamp_3');
    });

    it("keeps a removed item's assignment, so it comes back the same", async () => {
        const file = path.join(scratch, 'java-content.json');
        fs.writeFileSync(
            file,
            JSON.stringify({
                schemaVersion: 1,
                items: {
                    'loopback:gone': { model: 'loopback:gone', base: 'minecraft:bow' },
                    'loopback:broken': { model: 7 }
                }
            })
        );
        const assignments = new JavaContentAssignments(file, { info: () => {} });
        await assignments.load();
        assignments.assignItem('loopback:new', none);
        await assignments.save();

        const written = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(written).toEqual({
            schemaVersion: 1,
            items: {
                'loopback:gone': { model: 'loopback:gone', base: 'minecraft:bow' },
                'loopback:new': { model: 'loopback:new', base: 'minecraft:paper' }
            }
        });
    });

    it('writes nothing when no assignment was made', async () => {
        const file = path.join(scratch, 'java-content.json');
        const assignments = new JavaContentAssignments(file, { info: () => {} });
        await assignments.load();
        await assignments.save();
        expect(fs.existsSync(file)).toBe(false);
    });
});

describe('javaItemBaseOf', () => {
    it.each([
        ['a bow for an item that shoots', 'minecraft:shooter', 'minecraft:bow'],
        ['a snowball for one that is thrown', 'minecraft:throwable', 'minecraft:snowball'],
        ['paper for any other', 'minecraft:food', 'minecraft:paper']
    ])('gives %s', (_, component, base) => {
        expect(javaItemBaseOf(new Map([[component, {}]]))).toBe(base);
    });
});
