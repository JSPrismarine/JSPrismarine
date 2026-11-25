import type { UpdateChannel } from './feed';

/** A newer build than the one running. */
export interface AvailableUpdate {
    readonly version: string;
    /** The channel whose feed named it. */
    readonly channel: UpdateChannel;
    /** Where its release notes are. */
    readonly notes: string;
    /** Its GitHub release. */
    readonly url: string;
}

/** What the server knows about updates: the outcome of its last check, or why it does not check. */
export type UpdateStatus =
    | { readonly state: 'off'; readonly reason: string }
    | { readonly state: 'unchecked' }
    | { readonly state: 'up-to-date'; readonly checkedAt: number; readonly newest: string }
    | { readonly state: 'available'; readonly checkedAt: number; readonly update: AvailableUpdate }
    | { readonly state: 'failed'; readonly checkedAt: number; readonly reason: string };

/**
 * The status as one line, for `/version` and `update check`.
 * @param current - The running version.
 */
export const describeUpdateStatus = (status: UpdateStatus, current: string): string => {
    switch (status.state) {
        case 'off':
            return `Update checks are off: ${status.reason}`;
        case 'unchecked':
            return 'Update checks are on; the first check has not run yet';
        case 'up-to-date':
            return `This server is up to date: the newest build is ${status.newest}`;
        case 'available':
            return `JSPrismarine ${status.update.version} is out; this server runs ${current}. Release notes: ${status.update.notes}`;
        case 'failed':
            return `The last update check failed at ${new Date(status.checkedAt).toISOString()}: ${status.reason}`;
    }
};
