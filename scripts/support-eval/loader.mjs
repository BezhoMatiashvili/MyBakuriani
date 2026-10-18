// Node module hooks for the support eval: "@/..." -> src/, "server-only" ->
// an empty module, and extensionless relative imports -> .ts / .tsx, so the
// assistant's real server modules load in plain Node (type stripping).
const SRC = new URL("../../src/", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only")
    return { url: "data:text/javascript,export {}", shortCircuit: true };
  const target = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), SRC).href
    : specifier;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    // CommonJS packages without an exports map ("next/headers").
    if (!/^(?:\.|file:)/.test(target)) return nextResolve(`${target}.js`, context);
    for (const extension of EXTENSIONS) {
      try {
        return await nextResolve(target + extension, context);
      } catch {
        // try the next extension
      }
    }
    throw error;
  }
}
