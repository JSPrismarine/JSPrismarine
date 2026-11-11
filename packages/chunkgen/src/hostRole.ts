/**
 * The `--role` a compiled executable is started with to become the generation host.
 *
 * A compiled executable has no script to fork, so the pool starts the executable again with
 * this role and the executable's entry hands control to `generationHost`. Kept in a module of
 * its own so an entry can read it without loading the pool.
 */
export const GENERATION_HOST_ROLE = 'generation-host';
