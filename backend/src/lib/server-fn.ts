/**
 * Validates input and returns a plain async function for a Fastify route.
 * This is not a second HTTP server. The browser talks to Fastify only.
 */
type Handler<T, D> = (ctx: { data: D }) => Promise<T> | T;

export function defineService(_opts?: { method?: string }) {
  return {
    validator<D>(v: (d: unknown) => D) {
      return {
        handler<T>(h: Handler<T, D>) {
          return async (input: unknown = {}) => h({ data: v(input) });
        },
      };
    },
    handler<T>(h: Handler<T, unknown> | (() => Promise<T> | T)) {
      return async (input?: unknown) => h({ data: input as unknown });
    },
  };
}

/** @deprecated use defineService. Kept so older call sites keep compiling. */
export const createServerFn = defineService;
