export default interface Predicate<T> {
    (t: T): boolean;
}
