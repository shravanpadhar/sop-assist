"use client";

import { useCallback, useEffect, useState } from "react";

export interface Settings {
  /** When to read answers aloud automatically. */
  autoSpeak: "voice" | "always" | "never";
  rate: number;
  handsFree: boolean;
}
const DEFAULTS: Settings = { autoSpeak: "voice", rate: 1, handsFree: true };
const KEY = "sop-assist-settings";

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((patch: Partial<Settings>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [s, update];
}
