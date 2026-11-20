import type { PageData } from 'vitepress';

import {
    defaultCardStyle,
    type ImageChoice,
    isSitePath,
    landingPage,
    type PageImage,
    pageImage,
    parseImageChoice
} from './cardImage.ts';
import { type CardRequest, cardTitle, headlineText } from './cardContent.ts';

/** What a page's Open Graph tags say about it, which its card says too unless front matter rewords it. */
export interface PageText {
    title: string;
    /** The page's own description; the site's never stands in for it on a card. */
    description: string | undefined;
    siteUrl: string;
}

/**
 * A page's link preview image, and the card the build renders for it or the site file it names, if
 * any. The page's structured data reads the image from the `og:image` tag the config writes from it.
 */
export function resolvePageImage(
    { relativePath, frontmatter }: Pick<PageData, 'relativePath' | 'frontmatter'>,
    { title, description, siteUrl }: PageText
): { image: PageImage; card?: CardRequest; file?: string } {
    const choice: ImageChoice = parseImageChoice(frontmatter.image, relativePath);
    const ownTitle = choice.kind === 'card' && choice.title ? choice.title : title;
    const alt = relativePath === landingPage ? headlineText : cardTitle(relativePath, ownTitle);
    const image = pageImage(choice, { relativePath, alt, landingAlt: headlineText, siteUrl });
    // The build checks a site file once the site is built, so a typo fails it rather than shipping a broken preview.
    if (choice.kind === 'file') return isSitePath(choice.src) ? { image, file: choice.src } : { image };
    if (choice.kind !== 'card') return { image };
    return {
        image,
        card: {
            relativePath,
            style: choice.style ?? defaultCardStyle(relativePath),
            title: ownTitle,
            description: choice.description ?? description
        }
    };
}
