import { useEffect } from "react";

type AsyncLoader = (isActive?: () => boolean) => Promise<void>;

/** Avoids StrictMode's development-only effect probe issuing a duplicate HTTP
 * request, and gives the loader a cleanup guard for asynchronous responses. */
export function useInitialAsyncLoad(load: AsyncLoader) {
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(() => active); });
    return () => { active = false; };
  }, [load]);
}
