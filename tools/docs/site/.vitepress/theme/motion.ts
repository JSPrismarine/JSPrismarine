/** Whether the reader has asked for reduced motion. Only meaningful in the browser. */
export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs a callback once, the first time an element is a third of the way onto the screen.
 *
 * @param element - The element to watch.
 * @param run - What to do when it arrives.
 * @returns A function that stops watching.
 */
export function onceInView(element: Element, run: () => void): () => void {
    const observer = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            run();
        },
        { threshold: 0.35 }
    );
    observer.observe(element);
    return () => observer.disconnect();
}
