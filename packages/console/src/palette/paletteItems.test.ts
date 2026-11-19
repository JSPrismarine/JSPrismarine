import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG } from '../keymap/catalog';
import { fuzzyMatch } from './fuzzy';
import type { PaletteItem } from './paletteItems';
import { filterPalette, paletteItems } from './paletteItems';

const labels = (items: readonly PaletteItem[], query: string) =>
    filterPalette(items, query).map(({ item }) => (item.kind === 'action' ? item.id : `${item.kind}:${item.name}`));

describe('fuzzyMatch', () => {
    it('matches the query characters in order, ignoring case and spaces', () => {
        expect(fuzzyMatch('tsp', 'Toggle side pane')?.positions).toEqual([0, 7, 12]);
        expect(fuzzyMatch('TO P', 'stop')).toBeDefined();
    });

    it('rejects text that lacks a character or has them out of order', () => {
        expect(fuzzyMatch('zz', 'stop')).toBeUndefined();
        expect(fuzzyMatch('ps', 'stop')).toBeUndefined();
    });

    it('scores a run of characters and a word start above scattered ones', () => {
        const run = fuzzyMatch('op', 'op')!.score;
        const inside = fuzzyMatch('op', 'deop')!.score;
        const scattered = fuzzyMatch('op', 'Toggle side pane')!.score;
        expect(run).toBeGreaterThan(inside);
        expect(inside).toBeGreaterThan(scattered);
    });
});

describe('paletteItems', () => {
    it('offers every catalog action but the excluded ones, then commands and players', () => {
        const items = paletteItems(COMMAND_CATALOG, ['stop', 'op'], ['filfat'], ['view.palette']);

        const actions = items.filter((item) => item.kind === 'action');
        expect(actions).toHaveLength(COMMAND_CATALOG.length - 1);
        expect(actions.some((item) => item.kind === 'action' && item.id === 'view.palette')).toBe(false);
        expect(items.slice(actions.length).map((item) => item.kind)).toEqual(['command', 'command', 'player']);
    });

    it('carries an action key, or its hint when it has no binding of its own', () => {
        const items = paletteItems(COMMAND_CATALOG, [], []);
        const keyed = items.find((item) => item.kind === 'action' && item.id === 'view.toggleSidePane');
        const hinted = items.find((item) => item.kind === 'action' && item.id === 'server.stop');
        expect(keyed?.kind === 'action' && keyed.keys).toBeTruthy();
        expect(hinted?.kind === 'action' && hinted.keys).toBeTruthy();
    });
});

describe('filterPalette', () => {
    const items = paletteItems(COMMAND_CATALOG, ['op', 'deop', 'stop', 'list'], ['filfat']);

    it('keeps every item in order for an empty query', () => {
        expect(filterPalette(items, '')).toHaveLength(items.length);
        expect(filterPalette(items, '').map(({ item }) => item)).toEqual(items);
    });

    it('ranks the closest match first and leaves out what does not match', () => {
        const found = labels(items, 'op');
        expect(found[0]).toBe('command:op');
        expect(found).toContain('command:deop');
        expect(found).not.toContain('command:list');
    });

    it('finds players by name', () => {
        expect(labels(items, 'filf')).toEqual(['player:filfat']);
    });
});
