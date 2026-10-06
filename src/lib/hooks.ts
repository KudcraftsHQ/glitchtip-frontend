import { useEffect, useRef } from "react";

/** The one sanctioned effect: sync with an external system once, on mount. */
export function useMountEffect(fn: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, []);
}

/** A ref that always holds the latest value, for listeners registered once. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
