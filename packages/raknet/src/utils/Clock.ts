/**
 * Milliseconds from a monotonic source, for measuring elapsed time.
 *
 * Every deadline a session keeps - the retransmission timeout, the split reassembly
 * timeout, the session timeout - is a comparison between two readings of this clock, and
 * every round trip sample is their difference. `Date.now()` follows the system clock, so
 * an NTP correction or a suspend/resume moves it underneath all of them at once: a
 * forward step expires every deadline simultaneously and folds a step-sized round trip
 * into the RTT estimate, a backward step pushes every deadline out of reach and stops
 * retransmission until real time catches up. Neither is a network event, and neither
 * should look like one.
 *
 * Timestamps that travel on the wire are a different thing and keep using `Date.now()`:
 * they are opaque values the peer echoes back, not durations we measure.
 */
export const monotonicNow = (): number => performance.now();
