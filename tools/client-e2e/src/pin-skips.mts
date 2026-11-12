/**
 * The scenarios a pinned cinnabar build skips. Read `skips.mts` for what an entry must say, and the
 * client-e2e README for when a skip is acceptable. A skip names a build by its commit, so moving a
 * pin in `cinnabar.json` makes every skip written for the old commit fail validation until someone
 * re-checks it.
 */
import type { ScenarioSkip } from './skips.mts';

export const pinSkips: ScenarioSkip[] = [
    {
        scenario: 'glass-bottle-filling',
        // The protocol 2193 build.
        commit: '485c24673e9df7ba31a6788e24797cbc4a18c2a5',
        reason: {
            client:
                'The client aims a glass bottle with the plain block pick, which passes through water, so a ' +
                'right click on a water source sends only an InventoryTransaction USE with face 255 and no ' +
                'block, where it sends a PLACE on the water block for a bucket.',
            server:
                'A bottle used on nothing does nothing, so the server is right to leave both bottles in the ' +
                'hotbar. The scenario passes on the protocol 2225 build, which has the fix, and the useItemOnBlock ' +
                'liquid containers tests in packages/prismarine/src/item/interaction.test.ts fill a bottle from ' +
                'water through the server.'
        },
        references: [
            'https://github.com/JSPrismarine/JSPrismarine/issues/3025',
            'https://github.com/cinnabar-mc/cinnabar/pull/2827',
            'https://github.com/cinnabar-mc/cinnabar/commit/dd7d7dd53a52c40491e0eb49b5bc700a4974191e'
        ],
        fixedIn: 'dd7d7dd53a52c40491e0eb49b5bc700a4974191e'
    }
];
