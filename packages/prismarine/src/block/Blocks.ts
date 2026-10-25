/**
 * The vanilla block list, as the deleted class registry exposed it.
 *
 * @deprecated There are no block classes any more. The names come from the
 *   shipped state catalog, which is the same list `BlockManager` serves, and
 *   each one is wrapped in a throwaway zero-argument class only so the three
 *   world generation tests that still call this keep compiling. Those tests
 *   want `BlockManager.getBlocks()`; this goes when they are updated.
 */
import { Block } from './Block';
import { BlockStateSchemas } from './state/BlockStateSchema';

/**
 * Every vanilla block, as a constructor each.
 *
 * @deprecated Use `BlockManager.getBlocks()`, which answers the same list
 *   without building 1477 classes to do it.
 */
export const allBlocks = (): readonly (new () => Block)[] =>
    BlockStateSchemas.names().map(
        (name) =>
            class extends Block {
                public constructor() {
                    super({ name });
                }
            }
    );
