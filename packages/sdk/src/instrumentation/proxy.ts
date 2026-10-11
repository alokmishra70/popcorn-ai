type AnyFn = (...args: unknown[]) => unknown;

/** Builds the replacement for one method. `original` is already bound to its owner. */
export type MethodPatch = (original: AnyFn) => AnyFn;

/**
 * Returns a proxy of `root` where the methods at the given dotted paths
 * (e.g. `messages.create`) are replaced. Everything else passes through
 * untouched, so the wrapped client keeps its full type and behaviour. The
 * client object itself is never mutated.
 */
export function patchMethods<T extends object>(root: T, patches: Record<string, MethodPatch>): T {
  const paths = Object.keys(patches);
  const cache = new Map<string, unknown>();

  const wrap = (target: object, prefix: string): object =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof prop !== 'string') return value;

        const path = prefix ? `${prefix}.${prop}` : prop;
        const patch = patches[path];
        if (patch && typeof value === 'function') {
          if (!cache.has(path)) cache.set(path, patch((value as AnyFn).bind(obj)));
          return cache.get(path);
        }
        if (value && typeof value === 'object' && paths.some((p) => p.startsWith(`${path}.`))) {
          const key = `object:${path}`;
          if (!cache.has(key)) cache.set(key, wrap(value, path));
          return cache.get(key);
        }
        return value;
      },
    });

  return wrap(root, '') as T;
}
