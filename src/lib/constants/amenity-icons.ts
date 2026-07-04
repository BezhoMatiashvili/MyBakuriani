// Pictographic emoji, dingbats, symbols, variation selectors, ZWJ.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]/gu;

/** Strip emoji from a raw (unmapped) amenity value so it can never render one. */
export function cleanAmenityLabel(value: string): string {
  return value.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}
