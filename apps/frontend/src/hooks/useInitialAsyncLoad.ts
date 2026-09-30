import { useEffect } from "react";

type AsyncLoader = (isActive?: () => boolean, signal?: AbortSignal) => Promise<void>;

/** Avoids StrictMode's development-only effect probe issuing a duplicate HTTP
 * request, and gives the loader a cleanup guard for asynchronous responses. */
export function useInitialAsyncLoad(load: AsyncLoader) {
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => { if (active) void load(() => active, controller.signal); });
    return () => { active = false; controller.abort(); };
  }, [load]);
}
