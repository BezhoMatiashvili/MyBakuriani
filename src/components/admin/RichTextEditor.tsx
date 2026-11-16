"use client";

// The blog article editor on /dashboard/admin/seo (C60). Its schema is the
// sanitizer's allowlist: H2/H3, bold, italic, lists, links. A link always sits
// on selected text (never typed or pasted as a bare URL); the server
// sanitizes what this emits on save and again on the public page.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorContent,
  Extension,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import { normalizeLinkUrl } from "@/lib/blog/content";

type Props = {
  initialHtml: string;
  /** The editor's HTML, or "" when it is empty. */
  onChange: (html: string) => void;
};

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 hover:bg-[#F1F5F9] disabled:opacity-40 ${
        active ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#475569]"
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ initialHtml, onChange }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [needSelection, setNeedSelection] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const openLinkRef = useRef(() => {});

  const editor = useEditor({
    immediatelyRender: false,
    // Link's paste rule would turn a pasted URL into a link on the URL text.
    // Pasting a URL over selected text still links that text (linkOnPaste).
    enablePasteRules: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: false,
          defaultProtocol: "https",
          HTMLAttributes: { target: null, rel: null, class: null },
        },
      }),
      Extension.create({
        name: "blogLinkShortcut",
        addKeyboardShortcuts: () => ({
          "Mod-k": () => {
            openLinkRef.current();
            return true;
          },
        }),
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "blog-rich min-h-[260px] px-[14px] py-3 text-[16px] font-medium leading-[27px] text-[#475569] outline-none lg:text-[15px]",
        "aria-label": "სტატიის ტექსტი",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
    onSelectionUpdate: () => setNeedSelection(false),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            link: editor.isActive("link"),
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
            empty: editor.isEmpty,
          }
        : null,
  });

  function openLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      // Edit or remove the whole link the cursor is in.
      editor.chain().extendMarkRange("link").run();
      setLinkUrl(String(editor.getAttributes("link").href ?? ""));
    } else if (editor.state.selection.empty) {
      setLinkOpen(false);
      setNeedSelection(true);
      return;
    } else {
      setLinkUrl("");
    }
    setNeedSelection(false);
    setLinkError(false);
    setLinkOpen(true);
  }
  openLinkRef.current = openLink;

  useEffect(() => {
    if (!linkOpen) return;
    urlRef.current?.focus();
    // On a phone the bar can open under the fixed bottom nav: bring it up.
    barRef.current?.scrollIntoView({ block: "nearest" });
  }, [linkOpen]);

  function closeLink() {
    setLinkOpen(false);
    setLinkUrl("");
    setLinkError(false);
    editor?.commands.focus();
  }

  function applyLink() {
    const href = normalizeLinkUrl(linkUrl);
    if (!editor || !href) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    closeLink();
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    closeLink();
  }

  const chain = () => editor?.chain().focus();

  return (
    <div
      data-testid="blog-editor"
      className="rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/10"
    >
      <div
        role="toolbar"
        aria-label="ტექსტის ფორმატირება"
        className="flex flex-wrap gap-1 border-b border-[#E2E8F0] p-1.5"
      >
        <ToolButton
          label="ქვესათაური (H2)"
          active={state?.h2}
          disabled={!editor}
          onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="ქვესათაური (H3)"
          active={state?.h3}
          disabled={!editor}
          onClick={() => chain()?.toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="მუქი"
          active={state?.bold}
          disabled={!editor}
          onClick={() => chain()?.toggleBold().run()}
        >
          <Bold className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="დახრილი"
          active={state?.italic}
          disabled={!editor}
          onClick={() => chain()?.toggleItalic().run()}
        >
          <Italic className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="სია"
          active={state?.bullet}
          disabled={!editor}
          onClick={() => chain()?.toggleBulletList().run()}
        >
          <List className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="დანომრილი სია"
          active={state?.ordered}
          disabled={!editor}
          onClick={() => chain()?.toggleOrderedList().run()}
        >
          <ListOrdered className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="ბმული (Ctrl+K)"
          active={state?.link || linkOpen}
          disabled={!editor}
          onClick={openLink}
        >
          <Link2 className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="დაბრუნება"
          disabled={!state?.canUndo}
          onClick={() => chain()?.undo().run()}
        >
          <Undo2 className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          label="გამეორება"
          disabled={!state?.canRedo}
          onClick={() => chain()?.redo().run()}
        >
          <Redo2 className="h-5 w-5" />
        </ToolButton>
      </div>

      {linkOpen ? (
        <div
          ref={barRef}
          data-testid="blog-link-bar"
          className="flex scroll-my-24 flex-wrap items-center gap-2 border-b border-[#E2E8F0] p-2"
        >
          <input
            ref={urlRef}
            type="url"
            inputMode="url"
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeLink();
              }
            }}
            placeholder="https://mybakuriani.ge/..."
            aria-label="ბმულის მისამართი"
            aria-invalid={linkError}
            className="h-11 min-w-0 flex-1 basis-[180px] rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB]"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-11 rounded-lg bg-[#2563EB] px-4 text-[13px] font-bold text-white"
          >
            დამატება
          </button>
          {state?.link ? (
            <button
              type="button"
              onClick={removeLink}
              className="h-11 rounded-lg px-3 text-[13px] font-bold text-[#B91C1C] hover:bg-[#FEF2F2]"
            >
              ბმულის წაშლა
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeLink}
            className="h-11 rounded-lg px-3 text-[13px] font-bold text-[#64748B] hover:bg-[#F1F5F9]"
          >
            გაუქმება
          </button>
          {linkError ? (
            <p
              role="alert"
              className="w-full text-[12px] font-medium text-[#B91C1C]"
            >
              ბმული არასწორია. მაგალითად: https://mybakuriani.ge/bakuriani
            </p>
          ) : null}
        </div>
      ) : null}

      {needSelection ? (
        <p
          role="status"
          className="border-b border-[#E2E8F0] px-[14px] py-2 text-[12px] font-medium text-[#64748B]"
        >
          ჯერ მონიშნეთ ტექსტი, შემდეგ დააჭირეთ „ბმულს“.
        </p>
      ) : null}

      <div className="relative min-h-[260px]">
        {state?.empty ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[14px] top-3 text-[16px] font-medium leading-[27px] text-[#94A3B8] lg:text-[15px]"
          >
            სტატიის სრული ტექსტი...
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
