import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// src/lib/blog/sanitize.ts imports ./content without an extension (as Next
// resolves it): retry such a relative import with ".ts".
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(specifier, context, next) {" +
        " try { return await next(specifier, context); } catch (error) {" +
        " if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier))" +
        " return next(specifier + '.ts', context);" +
        " throw error; } }",
    ),
);
const {
  blogSnippet,
  editorHtmlFor,
  htmlToPlainText,
  isBlankContent,
  isRichHtml,
  normalizeLinkUrl,
  plainTextToHtml,
} = await import("../../src/lib/blog/content.ts");
const {
  ALLOWED_TAGS,
  markdownToBlogHtml,
  normalizeBlogContent,
  richHtmlOrNull,
  sanitizeBlogHtml,
} = await import("../../src/lib/blog/sanitize.ts");

const tagsIn = (html) =>
  new Set(
    [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()),
  );
const attrsIn = (html) =>
  new Set([...html.matchAll(/\s([a-z-]+)=/gi)].map((m) => m[1].toLowerCase()));

const XSS = [
  "<p><script>alert(1)</script>x</p>",
  '<p><img src=x onerror="alert(1)">x</p>',
  '<p><svg onload="alert(1)"><circle/></svg>x</p>',
  '<p><iframe src="https://evil.example"></iframe>x</p>',
  "<p><style>p{color:red}</style>x</p>",
  '<p onclick="alert(1)" style="color:red" class="c" id="i">x</p>',
  '<h2 onmouseover="alert(1)">x</h2><strong onclick="a()">y</strong>',
  '<p><a href="javascript:alert(1)">x</a></p>',
  '<p><a href="JaVa\tScript:alert(1)">x</a></p>',
  '<p><a href="&#106;avascript:alert(1)">x</a></p>',
  '<p><a href="data:text/html,<script>alert(1)</script>">x</a></p>',
  '<p><a href="vbscript:msgbox(1)">x</a></p>',
  '<p><a href="//evil.example/x">x</a></p>',
  '<p><a href="/\\evil.example">x</a></p>',
  '<p><a href="https://mybakuriani.ge@evil.example">x</a></p>',
  '<p><a href="https://ok.example" onclick="x()" target="_top" rel="opener" style="x">x</a></p>',
  "<p><b><i>nested <u>tags</u></b></i></p>",
  '<p><noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript></p>',
  "<p><![CDATA[><img src=x onerror=alert(1)>]]></p>",
  "<p><math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math></p>",
  "<p><form><input autofocus onfocus=alert(1)></form>x</p>",
  '<p><object data="javascript:alert(1)"></object><embed src=x>x</p>',
  '<p>unclosed <strong>bold <a href="https://ok.example">link',
];

test("the allowlist is exactly the editor's tags", () => {
  assert.deepEqual([...ALLOWED_TAGS].sort(), [
    "a",
    "br",
    "em",
    "h2",
    "h3",
    "li",
    "ol",
    "p",
    "strong",
    "ul",
  ]);
});

test("XSS corpus: only allowlisted tags and link attributes survive", () => {
  for (const input of XSS) {
    const out = sanitizeBlogHtml(input);
    for (const tag of tagsIn(out))
      assert.ok(ALLOWED_TAGS.includes(tag), `${tag} in ${out}`);
    for (const attr of attrsIn(out))
      assert.ok(["href", "target", "rel"].includes(attr), `${attr} in ${out}`);
    assert.doesNotMatch(
      out,
      /javascript|vbscript|data:|onerror|onload|onclick|<script|<img|<svg|<style/i,
      out,
    );
    for (const href of out.matchAll(/href="([^"]*)"/g))
      assert.ok(
        /^(https?:\/\/[^/]|\/[^/\\]|mailto:|tel:)/.test(href[1]),
        href[1],
      );
    assert.equal(sanitizeBlogHtml(out), out, `idempotent: ${input}`);
    assert.ok(out === "" || isRichHtml(out), `opens with a block: ${out}`);
  }
});

test("a bad link keeps its text and loses the link", () => {
  assert.equal(
    sanitizeBlogHtml('<p>a <a href="javascript:alert(1)">word</a> b</p>'),
    "<p>a word b</p>",
  );
});

test("the owner's example: the selected phrase links to the guide, same tab", () => {
  assert.equal(
    sanitizeBlogHtml(
      '<p>იხილეთ <a target="_blank" rel="nofollow" href="https://mybakuriani.ge/bakuriani">ბაკურიანის გზამკვლევი</a>.</p>',
    ),
    '<p>იხილეთ <a href="https://mybakuriani.ge/bakuriani">ბაკურიანის გზამკვლევი</a>.</p>',
  );
});

test("link attributes are set from the href", () => {
  const cases = [
    ["https://example.com/x", ' target="_blank" rel="noopener noreferrer"'],
    ["http://example.com", ' target="_blank" rel="noopener noreferrer"'],
    ["https://www.mybakuriani.ge/blog", ""],
    ["https://mybakuriani.com/x", ""],
    ["/bakuriani", ""],
    ["mailto:info@mybakuriani.ge", ""],
    ["tel:+995555123456", ""],
  ];
  for (const [href, extra] of cases)
    assert.equal(
      sanitizeBlogHtml(
        `<p><a href="${href}" target="_self" rel="opener">t</a></p>`,
      ),
      `<p><a href="${href}"${extra}>t</a></p>`,
    );
});

test("TipTap's output shapes round-trip (one pass, then a fixed point)", () => {
  const editor =
    "<h2>სათაური</h2><h3>ქვე</h3><p>a <strong>b</strong> <em>c</em> <strong><em>d</em></strong> " +
    '<a href="https://mybakuriani.ge/bakuriani">ბაკურიანის გზამკვლევი</a></p>' +
    "<ul><li><p>x</p></li><li><p>y</p></li></ul><ol><li><p>1</p></li></ol><p></p><p>a<br>b</p>";
  const once = sanitizeBlogHtml(editor);
  assert.equal(once, editor.replace("<br>", "<br />"));
  assert.equal(sanitizeBlogHtml(once), once);
  assert.equal(normalizeBlogContent(once), once);
  assert.equal(richHtmlOrNull(once), once);
});

test("legacy maps: b/i/h1/h4 become the editor's tags", () => {
  assert.equal(
    sanitizeBlogHtml("<h1>A</h1><h4>B</h4><p><b>c</b><i>d</i></p>"),
    "<h2>A</h2><h3>B</h3><p><strong>c</strong><em>d</em></p>",
  );
});

test("loose text between blocks is wrapped, so the result stays rich", () => {
  assert.equal(
    sanitizeBlogHtml(
      "<strong>B</strong><h2>H</h2><blockquote><p>q</p></blockquote><pre><code>c</code></pre><hr>tail",
    ),
    "<p><strong>B</strong></p><h2>H</h2><p>q</p><p>ctail</p>",
  );
});

test("isRichHtml: only a leading block tag counts", () => {
  for (const s of [
    "<p>x</p>",
    "\n  <h2>x</h2>",
    "<UL><li>x</li></UL>",
    '<p class="a">x</p>',
    "<ol>",
  ])
    assert.ok(isRichHtml(s), s);
  for (const s of [
    "<3 love",
    "\nplain",
    "p",
    "<pre>x</pre>",
    "<phone>",
    "# heading",
    "**b**",
    "https://x.ge",
    "<strong>x</strong>",
  ])
    assert.ok(!isRichHtml(s), s);
});

test("plainTextToHtml escapes and keeps the line structure", () => {
  assert.equal(
    plainTextToHtml('\nა <b>&</b> "q"\r\nline2\n\n\n# h\n'),
    "<p>ა &lt;b&gt;&amp;&lt;/b&gt; &quot;q&quot;<br>line2</p><p># h</p>",
  );
  assert.equal(editorHtmlFor("<p>x</p>"), "<p>x</p>");
  assert.equal(editorHtmlFor("x\n\ny"), "<p>x</p><p>y</p>");
  assert.equal(normalizeBlogContent("x <script>"), "<p>x &lt;script&gt;</p>");
});

test("htmlToPlainText: tags out, entities decoded, a cut tag dropped", () => {
  assert.equal(
    htmlToPlainText(
      '<h2>ა</h2><p>b &amp; c<br />d</p><ul><li><p>e</p></li></ul><p>see <a href="https://my',
    ),
    "ა b & c d e see",
  );
  assert.equal(
    blogSnippet('<p>a</p><p><a href="https://mybakuriani.ge">b</a></p>'),
    "a b",
  );
  assert.equal(blogSnippet("plain <3 excerpt"), "plain <3 excerpt");
});

test("emptiness is by text", () => {
  for (const s of [
    "",
    " ",
    "<p></p>",
    "<p> </p>",
    "<p>&nbsp;</p>",
    "<p><br></p>",
    "<ul><li><p></p></li></ul>",
  ])
    assert.ok(isBlankContent(s), JSON.stringify(s));
  for (const s of ["x", "<p>x</p>", '<p><a href="/x">a</a></p>'])
    assert.ok(!isBlankContent(s), s);
  assert.equal(normalizeBlogContent("<p></p>"), "");
  assert.equal(normalizeBlogContent("<p><script>x</script></p>"), "");
  assert.equal(normalizeBlogContent("  \n "), "");
});

test("normalizeLinkUrl", () => {
  const ok = {
    "https://mybakuriani.ge/bakuriani": "https://mybakuriani.ge/bakuriani",
    "  https://example.com/a?b=1#c ": "https://example.com/a?b=1#c",
    "mybakuriani.ge/bakuriani": "https://mybakuriani.ge/bakuriani",
    "www.example.com": "https://www.example.com",
    "/bakuriani": "/bakuriani",
    "mailto:info@mybakuriani.ge": "mailto:info@mybakuriani.ge",
    "tel:+995555123456": "tel:+995555123456",
  };
  for (const [input, want] of Object.entries(ok))
    assert.equal(normalizeLinkUrl(input), want, input);
  for (const bad of [
    "",
    "  ",
    "javascript:alert(1)",
    "JaVa\tScript:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "//evil.example",
    "/\\evil.example",
    "#top",
    "?q=1",
    "https://",
    "https://a b.com",
    "https://user:pw@example.com",
    "https://mybakuriani.ge@evil.example",
    "ftp://x.com",
    "localhost:3000",
    "word",
  ])
    assert.equal(normalizeLinkUrl(bad), null, JSON.stringify(bad));
});

test("markdownToBlogHtml: the AI draft's Markdown becomes editor HTML", () => {
  const html = markdownToBlogHtml(
    "# სათაური\n\nტექსტი **მუქი** და *დახრილი* [ბმული](https://mybakuriani.ge/bakuriani).\n\n## ქვე\n\n- a\n- b\n\n1. x\n2. y\n\n<script>alert(1)</script>\n\n> quote\n\n```\ncode\n```",
  );
  assert.match(html, /^<h2>სათაური<\/h2>/);
  assert.match(html, /<strong>მუქი<\/strong>/);
  assert.match(html, /<em>დახრილი<\/em>/);
  assert.match(
    html,
    /<a href="https:\/\/mybakuriani.ge\/bakuriani">ბმული<\/a>/,
  );
  assert.match(html, /<h2>ქვე<\/h2>/);
  assert.match(html, /<ul>\s*<li>a<\/li>/);
  assert.match(html, /<ol>\s*<li>x<\/li>/);
  assert.doesNotMatch(html, /script|<blockquote|<pre|<code/);
  assert.ok(isRichHtml(html));
  assert.equal(sanitizeBlogHtml(html), html);
  assert.ok(isRichHtml(markdownToBlogHtml("> only a quote")));
  assert.ok(isRichHtml(markdownToBlogHtml("```\nonly code\n```")));
});
