import { httpsFetch, messageOf } from '../addons/addonPack';
import { compareUpdateVersions, parseUpdateFeed, updateChannelFeeds, updateFeedUrl } from './feed';
import type { UpdateChannel, UpdateFeed } from './feed';
import type { AvailableUpdate, UpdateStatus } from './status';

/** The `User-Agent` a feed request sends: the software and the running version, and nothing else. */
export const updateUserAgent = (version: string): string => `JSPrismarine/${version}`;

/** How long one feed request may take, its redirects included. */
export const UPDATE_REQUEST_TIMEOUT_MS = 10_000;

/** One check's outcome, and whether it found a version no earlier check on this start had. */
export interface UpdateCheck {
    readonly status: UpdateStatus;
    /** Set when the check found a newer build this checker has not reported before. */
    readonly found?: AvailableUpdate;
}

/** The logger the checker writes to. */
export interface UpdateCheckerLogger {
    warn(message: string): void;
    debug(message: string): void;
}

/** Options for {@link UpdateChecker}. */
export interface UpdateCheckerOptions {
    /** The running server's version. */
    readonly current: string;
    readonly channel: UpdateChannel;
    /** Where the feed is, as `updates.source` takes it. */
    readonly source: string;
    readonly logger: UpdateCheckerLogger;
    /** The global `fetch` by default. The checker wraps it to stay on `https:` and end in time. */
    readonly fetch?: typeof fetch;
    /** Epoch milliseconds; `Date.now` by default. */
    readonly now?: () => number;
}

type FeedRead = { readonly feed: UpdateFeed } | { readonly error: string };

/**
 * Reads a channel's update feed and compares it with the running version. It neither schedules
 * nor logs what it finds: {@link check} reports a new build once in {@link UpdateCheck.found}, and
 * the caller decides who hears about it. A failed request is logged at `debug`, and a feed this
 * server cannot read once at `warn`, since that is the publisher's bug rather than the network's.
 */
export class UpdateChecker {
    private readonly fetcher: typeof fetch;
    private readonly now: () => number;
    private lastStatus: UpdateStatus = { state: 'unchecked' };
    private newest: AvailableUpdate | undefined;
    private readonly reported = new Set<string>();
    private warnedUnreadable = false;
    private pending: Promise<UpdateCheck> | undefined;

    public constructor(private readonly options: UpdateCheckerOptions) {
        this.fetcher = httpsFetch(options.fetch ?? fetch, UPDATE_REQUEST_TIMEOUT_MS);
        this.now = options.now ?? Date.now;
    }

    /** The outcome of the last check. */
    public status(): UpdateStatus {
        return this.lastStatus;
    }

    /** The newest build any check on this start found, kept when a later check fails. */
    public available(): AvailableUpdate | undefined {
        return this.newest;
    }

    /**
     * Reads the channel's feeds, the release feed too on the nightly channel, and takes the
     * newest build any of them names. A check while another runs shares that one.
     */
    public check(): Promise<UpdateCheck> {
        this.pending ??= this.run().finally(() => {
            this.pending = undefined;
        });
        return this.pending;
    }

    private async run(): Promise<UpdateCheck> {
        const reads = await Promise.all(updateChannelFeeds(this.options.channel).map((channel) => this.read(channel)));
        const checkedAt = this.now();
        const feeds = reads.flatMap((read) => ('feed' in read ? [read.feed] : []));
        const newest = feeds.reduce<UpdateFeed | undefined>(
            (best, feed) => (best === undefined || compareUpdateVersions(feed.version, best.version) > 0 ? feed : best),
            undefined
        );
        if (newest === undefined) {
            const reason = reads.flatMap((read) => ('error' in read ? [read.error] : [])).join('; ');
            this.lastStatus = { state: 'failed', checkedAt, reason };
            return { status: this.lastStatus };
        }
        if (compareUpdateVersions(newest.version, this.options.current) <= 0) {
            this.lastStatus = { state: 'up-to-date', checkedAt, newest: newest.version };
            return { status: this.lastStatus };
        }
        const update: AvailableUpdate = {
            version: newest.version,
            channel: newest.channel,
            notes: newest.notes,
            url: newest.url
        };
        this.newest = update;
        this.lastStatus = { state: 'available', checkedAt, update };
        if (this.reported.has(update.version)) return { status: this.lastStatus };
        this.reported.add(update.version);
        return { status: this.lastStatus, found: update };
    }

    private async read(channel: UpdateChannel): Promise<FeedRead> {
        // `updates.settings` checked the source, so this has a URL.
        const url = updateFeedUrl(this.options.source, channel) ?? this.options.source;
        let body: unknown;
        try {
            const response = await this.fetcher(url, {
                headers: { accept: 'application/json', 'user-agent': updateUserAgent(this.options.current) }
            });
            if (!response.ok) {
                await response.body?.cancel();
                return this.failed(`${url} answered ${response.status}`);
            }
            body = await response.json();
        } catch (error: unknown) {
            return this.failed(`could not read ${url}: ${messageOf(error)}`);
        }
        const feed = parseUpdateFeed(body);
        if (feed === undefined) {
            const error = `${url} is not an update feed this server reads`;
            if (!this.warnedUnreadable) this.options.logger.warn(`Update check: ${error}`);
            this.warnedUnreadable = true;
            return { error };
        }
        return { feed };
    }

    private failed(error: string): FeedRead {
        this.options.logger.debug(`Update check: ${error}`);
        return { error };
    }
}
