import { describe, expect, it } from 'vitest';

import { cardPath, landingPage } from './cardImage.ts';
import { headlineText } from './cardContent.ts';
import { resolvePageImage } from './pageCards.ts';

const siteUrl = 'https://docs.example/';
const page = (relativePath: string, frontmatter: Record<string, unknown> = {}) => ({ relativePath, frontmatter });

describe('resolvePageImage', () => {
    it("requests a card with the page's title and description, and describes it by the title", () => {
        const { image, card } = resolvePageImage(page('guide/joining.md'), {
            title: 'Joining a server',
            description: 'How players join.',
            siteUrl
        });
        expect(card).toEqual({
            relativePath: 'guide/joining.md',
            style: 'bento',
            title: 'Joining a server',
            description: 'How players join.'
        });
        expect(image).toMatchObject({
            url: new URL(cardPath('guide/joining.md'), siteUrl).href,
            alt: 'Joining a server'
        });
    });

    it("takes the card's own title and description from front matter, and its alt text from that title", () => {
        const { image, card } = resolvePageImage(
            page('adr/0014-x.md', { image: { title: 'Handlers share a shape', style: 'hero' } }),
            { title: 'A much longer title', description: 'The page.', siteUrl }
        );
        expect(card).toMatchObject({ title: 'Handlers share a shape', style: 'hero', description: 'The page.' });
        expect(image.alt).toBe('Handlers share a shape');
    });

    it('leaves the description to the card when the page has none of its own', () => {
        const { card } = resolvePageImage(page('guide/joining.md'), {
            title: 'Joining',
            description: undefined,
            siteUrl
        });
        expect(card?.description).toBeUndefined();
    });

    it("describes an API page and a package's errors by the name the card shows", () => {
        const api = resolvePageImage(page('api/@jsprismarine/nbt/classes/NBT.md'), {
            title: 'Class: NBT',
            description: undefined,
            siteUrl
        });
        expect(api.image.alt).toBe('NBT');
        const errors = resolvePageImage(page('errors/commands.md'), {
            title: '@jsprismarine/commands errors',
            description: undefined,
            siteUrl
        });
        expect(errors.image.alt).toBe('@jsprismarine/commands');
    });

    it("gives the landing page its headline as alt text, and a page with `image: false` the landing page's card", () => {
        const landing = resolvePageImage(page(landingPage), { title: 'Home', description: 'D', siteUrl });
        expect(landing.image.alt).toBe(headlineText);
        expect(landing.card?.style).toBe('hero');
        const off = resolvePageImage(page('guide/joining.md', { image: false }), {
            title: 'Joining',
            description: undefined,
            siteUrl
        });
        expect(off).toEqual({ image: { ...landing.image } });
    });

    it('names a site file for the build to check, but not an https image', () => {
        const text = { title: 'Joining', description: undefined, siteUrl };
        const named = resolvePageImage(page('guide/joining.md', { image: '/brand/card.png' }), text);
        expect(named.file).toBe('/brand/card.png');
        expect(named.card).toBeUndefined();
        expect(
            resolvePageImage(page('guide/joining.md', { image: 'https://cdn.example/a.png' }), text).file
        ).toBeUndefined();
    });
});
