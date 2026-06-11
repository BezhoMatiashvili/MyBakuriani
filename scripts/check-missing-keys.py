# Temporary i18n-migration audit: finds t("...") calls whose keys are missing
# from messages/ka.json. Static literal keys are checked exactly; template-
# literal keys are checked by prefix. Deleted after the migration.
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
messages = json.load(open(ROOT / "messages/ka.json"))


def flatten(obj, prefix=""):
    out = set()
    for k, v in obj.items():
        path = f"{prefix}{k}"
        if isinstance(v, dict):
            out |= flatten(v, path + ".")
            out.add(path)  # allow prefix checks
        else:
            out.add(path)
    return out


ALL_KEYS = flatten(messages)

# const t = useTranslations("Ns") | const t = await getTranslations("Ns")
DECL = re.compile(
    r"const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*[\"']([^\"']*)[\"']\s*\)"
)
# const t = await getTranslations({ locale, namespace: "Ns" })
DECL_OBJ = re.compile(
    r"const\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*[\"']([^\"']+)[\"'][^}]*\}\s*\)",
    re.S,
)
# bare hook: const t = useTranslations()
DECL_BARE = re.compile(
    r"const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*\)"
)
# typed function param: t: ReturnType<typeof useTranslations<"Ns">>
DECL_PARAM = re.compile(
    r"(\w+):\s*ReturnType<typeof useTranslations<[\"']([^\"']+)[\"']>>"
)

missing = []
dynamic_bad = []
files = sorted((ROOT / "src").rglob("*.ts*"))
for f in files:
    if f.suffix not in (".ts", ".tsx"):
        continue
    text = f.read_text(encoding="utf-8", errors="ignore")
    # The same var name (usually `t`) may be bound to different namespaces in
    # different functions of one file — a key counts as missing only if it
    # resolves under NONE of that var's namespaces.
    ns_by_var = {}
    for m in DECL.finditer(text):
        ns_by_var.setdefault(m.group(1), set()).add(m.group(2))
    for m in DECL_OBJ.finditer(text):
        ns_by_var.setdefault(m.group(1), set()).add(m.group(2))
    for m in DECL_BARE.finditer(text):
        ns_by_var.setdefault(m.group(1), set()).add("")
    for m in DECL_PARAM.finditer(text):
        ns_by_var.setdefault(m.group(1), set()).add(m.group(2))
    if not ns_by_var:
        continue
    rel = f.relative_to(ROOT)
    for var, namespaces in ns_by_var.items():
        # static keys: t("a.b") / t.has("a.b") / t.rich("a.b")
        for cm in re.finditer(
            rf"\b{re.escape(var)}(?:\.(?:has|rich|markup|raw))?\(\s*[\"']([^\"']+)[\"']", text
        ):
            keys = [(ns + "." if ns else "") + cm.group(1) for ns in namespaces]
            if not any(k in ALL_KEYS for k in keys):
                missing.append((str(rel), var, keys[0]))
        # template-literal keys: t(`a.${x}`) — verify the static prefix
        for cm in re.finditer(
            rf"\b{re.escape(var)}(?:\.(?:has|rich|markup|raw))?\(\s*`([^`$]*)\$", text
        ):
            prefix = cm.group(1).rstrip(".")
            if not prefix:
                continue
            fulls = [(ns + "." if ns else "") + prefix for ns in namespaces]
            if not any(k in ALL_KEYS for k in fulls):
                dynamic_bad.append((str(rel), var, fulls[0] + ".${...}"))

if missing:
    print(f"MISSING STATIC KEYS ({len(missing)}):")
    for rel, var, key in missing:
        print(f"  {rel}: {var}() -> {key}")
if dynamic_bad:
    print(f"DYNAMIC KEYS WITH UNKNOWN PREFIX ({len(dynamic_bad)}):")
    for rel, var, key in dynamic_bad:
        print(f"  {rel}: {var}() -> {key}")
if not missing and not dynamic_bad:
    print("OK: every referenced translation key resolves in messages/ka.json")
sys.exit(1 if (missing or dynamic_bad) else 0)
