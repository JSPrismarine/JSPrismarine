/**
 * How a Bedrock client is sent a slot's stack.
 */
import { Item } from '../../item/Item';

/** A slot as the wire carries it: an empty slot is an air stack of none, at its position. */
export const wireStackOf = (item: Item | null): Item => item ?? Item.air();
