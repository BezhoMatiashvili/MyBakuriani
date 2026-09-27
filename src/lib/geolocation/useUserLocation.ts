"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  parseCookieConsent,
  readCookieValue,
  serializeCookieConsent,
} from "@/lib/consent/cookies";

// The one place in the codebase that touches navigator.geolocation. Backs
// the cookie banner's "enable location" choice, the personalized road-status
// card, and every map's "show me the route" button.
//
// Coordinates are NEVER persisted anywhere - not this cookie, not
// localStorage/sessionStorage. Only the yes/no permission outcome is
// recorded (in the same mb_cookie_consent cookie as the analytics choice).
// Every consumer that needs coordinates again (a fresh page load, a second
// "show me the route" click) calls getCurrentPosition again: once consent is
// true, the browser already granted the permission, so this resolves
// without a dialog.

const POSITION_TIMEOUT_MS = 8000;
const POSITION_MAX_AGE_MS = 5 * 60 * 1000;

export type UserCoords = { lat: number; lng: number };

export type LocationStatus = "unset" | "granted" | "denied" | "unsupported";

function readConsent(): { analytics: boolean; location: boolean | null } {
  const parsed = parseCookieConsent(
    readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
  );
  // A location decision with no prior analytics answer defaults analytics to
  // the conservative "no" rather than inventing a choice the visitor never
  // made; a later banner answer overwrites this cookie with their real pick.
  return {
    analytics: parsed?.analytics ?? false,
    location: parsed?.location ?? null,
  };
}

function writeLocationConsent(location: boolean): void {
  const current = readConsent();
  // A no-op write (recording the same outcome again - e.g. a second
  // useUserLocation() instance reacting to the event this same write is
  // about to fire) must not re-dispatch: every mounted hook listens for this
  // event to react to a grant made elsewhere, and a redundant dispatch would
  // make each of them re-request location, which writes the same value
  // again, which dispatches again - forever.
  if (current.location === location) return;
  const value = serializeCookieConsent({
    analytics: current.analytics,
    location,
  });
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
    window.location.protocol === "https:" ? "; Secure" : ""
  }`;
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

/** Reads the current location consent without prompting anything. */
export function getLocationConsent(): boolean | null {
  if (typeof document === "undefined") return null;
  return readConsent().location;
}

/**
 * Declines location without ever calling getCurrentPosition - so choosing
 * "not now" never triggers a native permission dialog.
 */
export function declineLocation(): void {
  writeLocationConsent(false);
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: POSITION_TIMEOUT_MS,
      maximumAge: POSITION_MAX_AGE_MS,
    });
  });
}

/**
 * Prompts for (or reuses an already-granted) location permission. Resolves
 * to coordinates on success, null on denial/error/unsupported.
 *
 * Only an explicit PERMISSION_DENIED is recorded as a decline - a transient
 * TIMEOUT or POSITION_UNAVAILABLE must not look like a year-long opt-out
 * that the banner then never asks about again.
 */
export async function requestUserLocation(): Promise<UserCoords | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return null;
  }
  try {
    const position = await getPosition();
    writeLocationConsent(true);
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch (error) {
    if (
      error instanceof GeolocationPositionError &&
      error.code === GeolocationPositionError.PERMISSION_DENIED
    ) {
      writeLocationConsent(false);
    }
    return null;
  }
}

export function useUserLocation(): {
  coords: UserCoords | null;
  status: LocationStatus;
  request: () => Promise<UserCoords | null>;
} {
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [status, setStatus] = useState<LocationStatus>("unset");

  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return null;
    }
    const result = await requestUserLocation();
    setCoords(result);
    setStatus(result ? "granted" : "denied");
    return result;
  }, []);

  // Proactive, silent fetch on mount when consent was already granted
  // earlier (a prior page, or a prior visit) - permission is already
  // granted, so this resolves without a dialog and the personalized road
  // card can appear without an extra click. Also listens for a grant that
  // happens elsewhere on an already-mounted page (e.g. the cookie banner's
  // own "enable location" click, a separate useUserLocation() instance) -
  // without this, this hook's own coords would stay null until the next
  // full page load. This can't loop: writeLocationConsent() only dispatches
  // when the value actually changes, so this hook's own resulting write
  // (recording the same "true" again) is a no-op that fires no further event.
  useEffect(() => {
    if (getLocationConsent() === true) {
      void request();
    }
    const onConsentChange = () => {
      if (getLocationConsent() === true) {
        void request();
      }
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
    return () =>
      window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
  }, [request]);

  return { coords, status, request };
}
