// Keep client-side signup/recovery validation aligned. The authoritative
// password policy must also be configured in Supabase Auth so direct API calls
// cannot bypass this UI boundary.
export const MIN_PASSWORD_LENGTH = 12;
