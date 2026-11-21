import { describe, expect, it } from 'vitest';

import { claimingMenu, menuOverview } from './menuClaims.ts';
import type { MegaMenu } from './types.ts';

const guides: MegaMenu = {
    text: 'Guides',
    description: '',
    sections: [{ text: 'Build add-ons', items: [{ text: 'Writing an addon', link: '/guide/writing-addons' }] }]
};
const build: MegaMenu = {
    text: 'Build',
    description: '',
    featured: { text: 'Packages', description: '', link: '/packages' },
    sections: [{ text: 'Reference', items: [{ text: 'API reference', link: '/api/' }] }]
};
const addons: MegaMenu = {
    text: 'Addons',
    description: '',
    claimsPages: true,
    featured: { text: 'Marketplace', description: '', link: '/addons/' },
    sections: [{ text: 'Make', items: [{ text: 'Writing an addon', link: '/guide/writing-addons#the-pack' }] }]
};
const menus = [guides, build, addons];

describe('claimingMenu', () => {
    it('gives a claiming menu the pages it links and every page under its featured folder', () => {
        for (const route of ['/addons/', '/addons/tps-bar', '/addons/acme/addons/warps', '/guide/writing-addons'])
            expect(claimingMenu(route, menus)).toBe(addons);
    });

    it('leaves every other page to the menus that list it', () => {
        expect(claimingMenu('/guide/running', menus)).toBeUndefined();
        expect(claimingMenu('/api/', menus)).toBeUndefined();
        expect(claimingMenu('/guide/writing-addons', [guides, build])).toBeUndefined();
    });
});

describe('menuOverview', () => {
    it("is a menu's featured link when that is a folder", () => {
        expect(menuOverview(addons)).toBe('/addons/');
        expect(menuOverview(build)).toBeUndefined();
        expect(menuOverview(undefined)).toBeUndefined();
    });
});
