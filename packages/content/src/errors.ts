/**
 * Every failure this package raises. A content failure is a load-time
 * programming or data error, never a condition a tick loop recovers from, so
 * the runtime fails the load instead of returning a sentinel.
 */
export class ContentError extends Error {
    public override name = 'ContentError';
}
