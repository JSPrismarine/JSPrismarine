// A `using` declaration, which an engine without explicit resource management refuses to parse.
let disposed = false;
{
    using resource = {
        [Symbol.dispose ?? Symbol.for('dispose')]() {
            disposed = true;
        }
    };
}
export default disposed;
