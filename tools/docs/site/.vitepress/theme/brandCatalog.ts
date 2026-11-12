/**
 * What each brand component is for, in the order the brand guide lists them. The theme registers exactly
 * these components and the guide's component table is generated from this list, so neither can name a
 * component the other does not have.
 */
export const brandPurposes = {
    PrismMark: 'The mark as inline SVG, at any size.',
    BrandButton: 'Primary, outline (on dark) and secondary (on the page) buttons.',
    TerminalWindow: 'A server console frame. Each `t-line` span in the slot is a line.',
    AudienceTabs:
        'Keyboard-navigable tab cards with a pitch, a snippet and links each. `anchor` gives each panel a linkable id.',
    BentoGrid: 'A grid of solid color tiles, six columns wide.',
    BentoTile: 'One solid color tile, for a short claim or a figure.',
    ParityBars: 'The behavior parity score and bars, counted as the tracker counts.',
    CopyButton: 'Copies a command to the clipboard.',
    DemoServer: "The demo server's full-width band: a `WindowBlind` with the pitch and a `BoardingPass` to join with.",
    WindowBlind: 'A cabin window with a blind to pull. The blind carries a heading; the land passes while it is up.',
    BoardingPass: 'An upright pass that prints from a slot, leans toward the pointer, and has a stub that tears off.',
    PassingLand: "Land made of the mark's triangle, in two ranges, for a window or a backdrop.",
    RouteLine:
        'Stops on a transit line with a rider, for steps in order: a guide, a release history, a roadmap. With `selectable`, the rider goes to the stop the reader points at.',
    ReleaseLine: "The release history on a `RouteLine`, with the selected release's first changes under it.",
    LatestRelease: "The newest release's version, date and first changes.",
    ReleaseNotes: 'Release notes from the changelog, with long groups collapsed.',
    PackageDirectory: 'A filterable grid of the published packages.',
    Ticker: 'A looping banner of short phrases, with a Pause button.'
} as const;

/** The name of a brand component the theme registers. */
export type BrandComponentName = keyof typeof brandPurposes;
