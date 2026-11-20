import { readFileSync } from 'node:fs';

import { prismSvg, wordmark } from '../theme/prism.ts';
import { palette } from '../theme/tokens.ts';
import { cardSize } from './cardImage.ts';
import type { CardContent, Figure, Tone } from './cardContent.ts';
import { clip, type FittedText, fitText, measure } from './fitText.ts';
import { type Typeface, typefaces } from './typefaces.ts';

/** A CSS property map in the subset satori lays out. */
type Style = Record<string, string | number>;

/** One element of the tree satori renders, shaped like a React element. */
export interface CardNode {
    type: string;
    props: { style?: Style; children?: CardChild | CardChild[]; [attribute: string]: unknown };
}

type CardChild = CardNode | string;

/**
 * A flex box. Satori lays out only flexbox, and sizes boxes as `content-box` unless told otherwise, so
 * every box sets both.
 */
function box(style: Style, ...children: (CardChild | false | undefined)[]): CardNode {
    const kept = children.filter((child) => child !== false && child !== undefined);
    return {
        type: 'div',
        props: { style: { display: 'flex', boxSizing: 'border-box', ...style }, children: kept }
    };
}

/** A run of text in one typeface. `pre` keeps satori from wrapping a line `fitText` measured. */
const text = (face: Typeface, style: Style, content: string) =>
    box({ fontFamily: face.family, fontWeight: face.weight, whiteSpace: 'pre', ...style }, content);

/** Lines `fitText` broke, one row each, so the card draws the breaks it measured. */
const lines = (fitted: FittedText, face: Typeface, style: Style) =>
    box(
        { flexDirection: 'column' },
        ...fitted.lines.map((line) => text(face, { fontSize: fitted.size, ...style }, line))
    );

/** The prism mark, drawn from the same SVG as the favicon. */
const mark = (size: number): CardNode => ({
    type: 'img',
    props: { src: `data:image/svg+xml,${encodeURIComponent(prismSvg())}`, width: size, height: size }
});

/** A length from `brand.css`, such as `--jsp-gap`, in site pixels. */
function brandLength(property: string) {
    const css = readFileSync(new URL('../theme/brand.css', import.meta.url), 'utf8');
    const value = new RegExp(`${property}:\\s*(\\d+)px`).exec(css)?.[1];
    if (!value) throw new Error(`brand.css no longer sets ${property} in pixels, which the link preview cards use.`);
    return Number(value);
}

/**
 * Card pixels per site pixel. A link preview shows the 1200 pixel card at about half size, so the card
 * sets the site's sizes doubled to read the same.
 */
const scale = 2;
/**
 * Labels scale further: X and chat apps show a card about 400 pixels wide, a third of its size, where a
 * doubled 13 pixel label would be under 9 pixels.
 */
const labelScale = 2.5;
const radius = brandLength('--jsp-radius-panel') * scale;
const controlRadius = brandLength('--jsp-radius-control') * scale;
const gap = brandLength('--jsp-gap') * scale;
const labelSize = Math.floor(brandLength('--jsp-label-size') * labelScale);

/** The mono labels' tracking, in em. Runs that keep their case, such as a package name, take none. */
const labelTracking = 0.1;

/** Display type: tight, as the site's headlines are. Identifiers are mono, whose dots tight tracking would hide. */
const titleSetting = (identifier: boolean) =>
    identifier
        ? { face: typefaces.monoBold, tracking: -0.02, lineHeight: 1.05, scale: 0.8 }
        : { face: typefaces.display, tracking: -0.045, lineHeight: 0.96, scale: 1 };

/** Body text's line height, as a factor of its size. */
const bodyLineHeight = 1.28;

/**
 * Fits a page title, and its description in the height the title leaves. The title takes the largest
 * of `sizes` that fits while keeping room for up to two lines of description, and the description
 * then takes as many lines as are left, up to `maxDescriptionLines`. A title with no description
 * beside it may go smaller and run longer.
 */
function titleAndDescription(
    content: CardContent,
    {
        sizes,
        width,
        height,
        bodySize,
        gapAbove,
        maxDescriptionLines
    }: {
        sizes: number[];
        width: number;
        height: number;
        bodySize: number;
        gapAbove: number;
        maxDescriptionLines: number;
    },
    colors: { title: string; body: string }
) {
    const { scale: shrink, ...setting } = titleSetting(content.identifier);
    const { description } = content;
    const bodyOptions = { face: typefaces.body, tracking: 0, lineHeight: bodyLineHeight, width, avoidWidows: true };
    const bodyLine = bodySize * bodyLineHeight;
    const wanted = description
        ? Math.min(2, fitText(description, { ...bodyOptions, sizes: [bodySize], maxLines: 2 }).lines.length)
        : 0;
    const reserved = description ? gapAbove + wanted * bodyLine : 0;
    const title = fitText(content.title, {
        ...setting,
        width,
        maxHeight: height - reserved,
        sizes: [...sizes, ...(description ? [] : [40])].map((size) => Math.round(size * shrink)),
        maxLines: description ? 5 : 7,
        // An identifier reads best unbroken: one line nearly a third smaller beats two lines.
        preferOneLine: content.identifier ? 0.7 : undefined
    });
    const left = height - title.lines.length * title.size * setting.lineHeight - gapAbove;
    const body =
        description &&
        fitText(description, {
            ...bodyOptions,
            sizes: [bodySize],
            maxLines: Math.max(1, Math.min(maxDescriptionLines, Math.floor(left / bodyLine)))
        });
    return {
        title: lines(title, setting.face, {
            lineHeight: setting.lineHeight,
            letterSpacing: `${setting.tracking}em`,
            color: colors.title
        }),
        description: body ? lines(body, typefaces.body, { lineHeight: bodyLineHeight, color: colors.body }) : undefined
    };
}

/**
 * A small label: mono and set in caps with open tracking, except runs that keep their case, such as a
 * version or a package name, which take no tracking.
 */
function label(runs: { text: string; asIs?: boolean }[][], width: number, fill: string) {
    const setting = { face: typefaces.monoBold, size: labelSize, tracking: labelTracking };
    const parts = runs
        .flatMap((group, index) => [
            ...(index ? [{ text: ' · ' }] : []),
            ...group.flatMap((run, at) => [...(at ? [{ text: ' ' }] : []), run])
        ])
        .map(({ text, asIs }) => ({ text: asIs ? text : text.toUpperCase(), asIs }));
    // Measured with every run's tracking open, which is never narrower than the label as set.
    const whole = parts.map(({ text }) => text).join('');
    const clipped = clip(whole, setting, width);
    if (clipped !== whole)
        return text(setting.face, { fontSize: labelSize, letterSpacing: `${labelTracking}em`, color: fill }, clipped);
    return box(
        { alignItems: 'baseline' },
        ...parts.map((run) =>
            text(
                setting.face,
                { fontSize: labelSize, letterSpacing: run.asIs ? '0' : `${labelTracking}em`, color: fill },
                run.text
            )
        )
    );
}

/** The wordmark: one word, Bricolage Grotesque 800. */
const wordmarkSetting = { face: typefaces.heading, tracking: -0.04 };
const wordmarkText = (size: number, fill: string) =>
    text(typefaces.heading, { fontSize: size, letterSpacing: `${wordmarkSetting.tracking}em`, color: fill }, wordmark);

/** The landing page's headline, with its last word on an accent block as the hero sets it. */
function headline({ headline }: CardContent, size: number) {
    if (!headline) return undefined;
    const setting = { fontSize: size, lineHeight: 0.9, letterSpacing: '-0.055em', color: palette.cream.hex };
    return box(
        { flexDirection: 'column' },
        ...headline.lines.slice(0, -1).map((line) => text(typefaces.display, setting, line)),
        box(
            { alignItems: 'center' },
            text(typefaces.display, setting, `${headline.lines.at(-1)} `),
            text(
                typefaces.display,
                {
                    ...setting,
                    color: palette.deep.hex,
                    background: palette.accent.hex,
                    padding: `0 ${Math.round(size * 0.12)}px ${Math.round(size * 0.06)}px`,
                    transform: 'rotate(-1.5deg)'
                },
                headline.highlight
            )
        )
    );
}

/**
 * A figure's tracking: tight, but open when it has dots or dashes in it, such as a version or a date,
 * so they show.
 */
const figureTracking = (value: string) => (/[.-]/.test(value) ? -0.03 : -0.05);

/**
 * A figure in display type at the largest of `sizes` that fits. A figure is a fact, so one cut short
 * would misstate it: it fails the build instead.
 */
function figureValue(value: string, sizes: number[], width: number, fill: string) {
    const tracking = figureTracking(value);
    const fitted = fitText(value, {
        face: typefaces.display,
        tracking,
        lineHeight: 0.9,
        sizes,
        width,
        // A figure of two words, such as `Abstract class`, may take two lines; a number or date takes one.
        maxLines: value.includes(' ') ? 2 : 1
    });
    if (fitted.truncated || fitted.lines.some((line) => line.endsWith('-')))
        throw new Error(`The figure "${value}" does not fit its ${width} pixel box at ${sizes.at(-1)} pixels.`);
    return lines(fitted, typefaces.display, { lineHeight: 0.9, letterSpacing: `${tracking}em`, color: fill });
}

/** A figure's label: mono caps, or an identifier as it is, on up to three lines. */
function figureLabel({ label: text, identifier }: Figure, width: number, fill: string) {
    const tracking = identifier ? 0 : labelTracking;
    const fitted = fitText(identifier ? text : text.toUpperCase(), {
        face: typefaces.monoBold,
        tracking,
        lineHeight: 1.2,
        // Down to the doubled `--jsp-label-size`, the brand's smallest label, for a long package name.
        sizes: [labelSize, Math.round(labelSize * 0.88), brandLength('--jsp-label-size') * scale],
        width,
        maxLines: 3
    });
    return lines(fitted, typefaces.monoBold, { lineHeight: 1.2, letterSpacing: `${tracking}em`, color: fill });
}

/**
 * Hero: the landing hero's forest slab. The label and the title sit at the top beside the mark, and
 * the figure is set large in the lower left, in accent, as the brand allows a figure on forest. A page
 * with no figure sets its title and description in the lower left instead. The wordmark is in the
 * lower right, where X's domain label, which covers the lower left, leaves it alone.
 */
export function heroCard(content: CardContent): CardNode {
    const { width, height } = cardSize;
    const safe = 60;
    // Half the mark's width is its clear space, the same as the safe area.
    const markSize = 120;
    const wordmarkSize = 40;
    const innerWidth = width - safe * 2;
    const innerHeight = height - safe * 2;
    const topWidth = innerWidth - markSize - markSize / 2;
    const wordmarkWidth = measure(wordmark, { ...wordmarkSetting, size: wordmarkSize });
    const bottomWidth = innerWidth - wordmarkWidth - markSize / 2;
    const { figure } = content;

    const eyebrow =
        content.eyebrow.length > 0 &&
        box(
            { alignItems: 'center', marginBottom: 28 },
            box({ width: 16, height: 16, background: palette.signal.hex, marginRight: 16 }),
            label(content.eyebrow, topWidth - 32, palette.mint.hex)
        );
    const eyebrowHeight = eyebrow ? labelSize + 28 : 0;

    const figureSizes = [112, 96, 80];
    const figureBlock =
        figure &&
        box(
            { flexDirection: 'column' },
            figureValue(figure.value, figureSizes, bottomWidth, palette.accent.hex),
            box(
                { marginTop: 14 },
                label([[{ text: figure.label, asIs: figure.identifier }]], bottomWidth, palette.mint.hex)
            )
        );
    const figureHeight = figure ? figureSizes[0] * 0.9 + 14 + labelSize : 0;

    const headlineBlock = headline(content, 124);
    const textWidth = figure ? topWidth : bottomWidth;
    const fitted = titleAndDescription(
        content,
        {
            sizes: [128, 112, 100, 92, 84, 76, 68, 60, 54, 46],
            width: textWidth,
            // With a figure, the title shares the height with it; without one, it has all but the label's.
            height: innerHeight - eyebrowHeight - (figure ? figureHeight + 24 : 0),
            bodySize: 32,
            gapAbove: 26,
            maxDescriptionLines: 3
        },
        { title: palette.cream.hex, body: palette.mint.hex }
    );
    const words = box(
        { flexDirection: 'column', width: textWidth },
        headlineBlock ?? fitted.title,
        fitted.description && box({ marginTop: 26 }, fitted.description)
    );

    return box(
        {
            width,
            height,
            background: palette.forest.hex,
            padding: safe,
            flexDirection: 'column',
            justifyContent: 'space-between'
        },
        box(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            box({ flexDirection: 'column', width: topWidth }, eyebrow, figure && words),
            mark(markSize)
        ),
        box(
            { justifyContent: 'space-between', alignItems: 'flex-end' },
            figure ? figureBlock : words,
            wordmarkText(wordmarkSize, palette.cream.hex)
        )
    );
}

/**
 * Each tone's tile: its surface, its text and its figure color, in the pairs the brand guide allows,
 * and whether the mark needs a cream plate there. The mark keeps its faces on cream, forest and ink,
 * so it sits on ink as it is.
 */
const tiles: Record<Tone, { surface: string; text: string; figure: string; plate: boolean }> = {
    accent: { surface: palette.accent.hex, text: palette.deep.hex, figure: palette.deep.hex, plate: true },
    mint: { surface: palette.mint.hex, text: palette.deep.hex, figure: palette.deep.hex, plate: true },
    signal: { surface: palette.signal.hex, text: palette.ink.hex, figure: palette.ink.hex, plate: true },
    // Accent on ink is for figures and display type only, which is all it sets here.
    ink: { surface: palette.ink.hex, text: palette.cream.hex, figure: palette.accent.hex, plate: false }
};

/**
 * Bento: the landing page's solid tiles. The title sits on forest with its description pinned to the
 * bottom, beside a tile in the section's color that names the section and shows the figure.
 */
export function bentoCard(content: CardContent): CardNode {
    const { width, height } = cardSize;
    // Wide enough that X's 2:1 crop of the card keeps the tiles' rounded corners.
    const pad = 48;
    const side = 300;
    const inner = 48;
    const tileInner = 36;
    const brandHeight = 124;
    const titleWidth = width - pad * 2 - gap - side - inner * 2;
    const tile = tiles[content.tone];
    const tileWidth = side - tileInner * 2;
    const { figure } = content;

    const fitted = titleAndDescription(
        content,
        {
            sizes: [144, 128, 116, 104, 96, 88, 80, 72, 64, 58, 52, 46],
            width: titleWidth,
            height: height - pad * 2 - inner * 2,
            bodySize: 30,
            gapAbove: 24,
            maxDescriptionLines: 5
        },
        { title: palette.cream.hex, body: palette.mint.hex }
    );

    const figureBlock = figure
        ? box(
              { flexDirection: 'column' },
              figureValue(figure.value, [88, 76, 64, 56, 48, 40], tileWidth, tile.figure),
              box({ marginTop: 12 }, figureLabel(figure, tileWidth, tile.text))
          )
        : // With no figure, the mark fills the tile, with half its width of clear space on every side: on a
          // cream plate where the tile's color is not one the mark keeps its faces on.
          box(
              {
                  width: tileWidth,
                  height: tileWidth,
                  ...(tile.plate && { background: palette.cream.hex }),
                  borderRadius: controlRadius,
                  alignItems: 'center',
                  justifyContent: 'center'
              },
              mark(tileWidth / 2)
          );

    return box(
        { width, height, background: palette.cream.hex, padding: pad, gap },
        box(
            {
                width: width - pad * 2 - gap - side,
                background: palette.forest.hex,
                borderRadius: radius,
                padding: inner,
                flexDirection: 'column',
                justifyContent: 'space-between'
            },
            fitted.title,
            fitted.description && box({ marginTop: 24 }, fitted.description)
        ),
        box(
            { width: side, flexDirection: 'column', gap },
            box(
                {
                    flexGrow: 1,
                    background: tile.surface,
                    borderRadius: radius,
                    // The section's name starts level with the title beside it.
                    padding: `${inner}px ${tileInner}px ${tileInner}px`,
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                },
                lines(
                    fitText(content.section, {
                        face: typefaces.heading,
                        tracking: -0.035,
                        lineHeight: 1,
                        sizes: [40, 34],
                        width: tileWidth,
                        maxLines: 2
                    }),
                    typefaces.heading,
                    { lineHeight: 1, letterSpacing: '-0.035em', color: tile.text }
                ),
                figureBlock
            ),
            // The wordmark lines up with the tile's text above it, and the mark, when the tile does not
            // show it, stands at the other end, so the wordmark sits in the same place on every card.
            box(
                {
                    height: brandHeight,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `0 ${tileInner}px`
                },
                wordmarkText(28, palette.ink.hex),
                // Small enough to keep half its width clear of the wordmark.
                figure && mark(40)
            )
        )
    );
}
