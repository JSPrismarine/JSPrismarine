/** Orders two entities by runtime id, ascending, which is the order every entity query answers in. */
export const byRuntimeId = (left: { getRuntimeId(): bigint }, right: { getRuntimeId(): bigint }): number => {
    const leftId = left.getRuntimeId();
    const rightId = right.getRuntimeId();
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};
