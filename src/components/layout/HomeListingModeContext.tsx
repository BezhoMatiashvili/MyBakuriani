"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type HomeListingMode = "rent" | "sale";

type HomeListingModeContextValue = {
  listingMode: HomeListingMode;
  setListingMode: (mode: HomeListingMode) => void;
};

const HomeListingModeContext = createContext<
  HomeListingModeContextValue | undefined
>(undefined);

export function HomeListingModeProvider({ children }: { children: ReactNode }) {
  const [listingMode, setListingModeState] = useState<HomeListingMode>("rent");

  const setListingMode = useCallback((mode: HomeListingMode) => {
    setListingModeState(mode);
  }, []);

  const value = useMemo(
    () => ({ listingMode, setListingMode }),
    [listingMode, setListingMode],
  );

  return (
    <HomeListingModeContext.Provider value={value}>
      {children}
    </HomeListingModeContext.Provider>
  );
}

export function useHomeListingMode() {
  const ctx = useContext(HomeListingModeContext);
  if (!ctx) {
    throw new Error(
      "useHomeListingMode must be used within HomeListingModeProvider",
    );
  }
  return ctx;
}
