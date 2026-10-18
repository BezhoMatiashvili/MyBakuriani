// In-process bound on ownership-document uploads (C39): at most one upload in
// flight per user and three per process. The upload route takes it BEFORE it
// reads the multipart body, so this process never holds more than three
// buffered files of its own. It does not bound Next's middleware, which still
// buffers up to 11 MB (next.config.ts middlewareClientMaxBodySize) of any /api
// POST before a route runs.

const MAX_UPLOADS_PER_PROCESS = 3;

const uploading = new Set<string>();

/** A release function (safe to call more than once), or null when busy. */
export function tryAcquireUpload(userId: string): (() => void) | null {
  if (uploading.has(userId) || uploading.size >= MAX_UPLOADS_PER_PROCESS) {
    return null;
  }
  uploading.add(userId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    uploading.delete(userId);
  };
}
