export type LegalSubsection = {
  /** Stable anchor id, identical across locales (e.g. "unified-id") */
  id: string;
  title?: string;
  body?: string;
  bullets?: string[];
};

export type LegalSection = {
  /** Stable anchor id, identical across locales (e.g. "platform-status") */
  id: string;
  title: string;
  body?: string;
  bullets?: string[];
  subsections?: LegalSubsection[];
};

export type LegalDoc = {
  title: string;
  lastUpdated: string;
  /** Optional untitled paragraph rendered before the first section */
  intro?: string;
  sections: LegalSection[];
};
