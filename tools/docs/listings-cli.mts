/**
 * `pnpm run addons:listings`: refreshes `addons/listings.lock.json` from the indexes of the
 * repositories `addons/listings.json` names and of JSPrismarine's own addons. `--check` reads no
 * network and fails when the lock no longer matches the listings file.
 */

import { writeFileSync } from 'node:fs';

import { loadAddons } from './addons.mts';
import {
    listingsLockFile,
    loadListingsFile,
    loadListingsLock,
    lockProblems,
    networkSources,
    refreshListings,
    serializeListingsLock
} from './listings.mts';

const listings = loadListingsFile();
const previous = loadListingsLock();

if (process.argv.includes('--check')) {
    const problems = lockProblems(listings, previous);
    if (problems.length > 0) {
        console.error(
            `addons/listings.lock.json is stale; run pnpm run addons:listings:\n${problems.map((p) => `- ${p}`).join('\n')}`
        );
        process.exit(1);
    }
    console.log('addons/listings.lock.json matches addons/listings.json');
} else {
    const firstParty = (await loadAddons()).map(({ name }) => name);
    const lock = await refreshListings(listings, firstParty, previous, networkSources());
    writeFileSync(listingsLockFile, serializeListingsLock(lock));
    console.log(`Wrote addons/listings.lock.json with ${lock.addons.length} addons`);
}
