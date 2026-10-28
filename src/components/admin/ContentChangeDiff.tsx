"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import PhotoStrip, { type PhotoBadge } from "@/components/admin/PhotoStrip";
import { renderableImageUrl } from "@/lib/banner-creative";
import {
  fieldLabel,
  isPdfUrl,
  photoDiffNotes,
  photoListDiff,
  roomFacts,
  roomMarks,
  roomsLostData,
  type RoomMark,
} from "@/lib/content-change/diff-display";
import type { FieldDiff } from "@/lib/content-change/types";
import { parseHotelRooms, type HotelRoom } from "@/lib/hotel-rooms";

const COVER: PhotoBadge = { text: "მთავარი", tone: "cover" };
const ADDED: PhotoBadge = { text: "ახალი", tone: "added" };
const REMOVED: PhotoBadge = { text: "წაშლილი", tone: "removed" };

const ROOM_MARKS: Record<
  Exclude<RoomMark, null>,
  { text: string; cls: string }
> = {
  new: { text: "ახალი ნომრის ტიპი", cls: "bg-[#DCFCE7] text-[#166534]" },
  changed: { text: "შეცვლილი", cls: "bg-[#FEF3C7] text-[#B45309]" },
  removed: { text: "წაშლილი ნომრის ტიპი", cls: "bg-[#FEE2E2] text-[#B91C1C]" },
};

/** field_diff of one content change request: current vs proposed per field. */
export default function ContentChangeDiff({ diff }: { diff: FieldDiff }) {
  return (
    <div className="grid gap-3">
      {Object.entries(diff).map(([field, values]) => (
        <FieldCard
          key={field}
          field={field}
          before={values.before}
          after={values.after}
        />
      ))}
    </div>
  );
}

function FieldCard({
  field,
  before,
  after,
}: {
  field: string;
  before: unknown;
  after: unknown;
}) {
  const label = fieldLabel(field);
  let notes: string[] = [];
  let sides: [ReactNode, ReactNode];

  const photos = field === "photos" ? photoListDiff(before, after) : null;
  if (photos) {
    notes = photoDiffNotes(photos);
    sides = [
      <PhotoStrip
        key="b"
        urls={photos.before}
        label={label}
        badges={(u, i) => [
          ...(i === 0 ? [COVER] : []),
          ...(photos.removed.has(u) ? [REMOVED] : []),
        ]}
      />,
      <PhotoStrip
        key="a"
        urls={photos.after}
        label={label}
        badges={(u, i) => [
          ...(i === 0 ? [COVER] : []),
          ...(photos.added.has(u) ? [ADDED] : []),
        ]}
      />,
    ];
  } else if (field === "hotel_rooms") {
    const b = parseHotelRooms(before);
    const a = parseHotelRooms(after);
    const marks = roomMarks(b, a);
    const photosB = new Set(b.flatMap((r) => r.photos));
    const photosA = new Set(a.flatMap((r) => r.photos));
    sides = [
      <Rooms
        key="b"
        raw={before}
        rooms={b}
        marks={marks.before}
        badge={(u) => (photosA.has(u) ? [] : [REMOVED])}
      />,
      <Rooms
        key="a"
        raw={after}
        rooms={a}
        marks={marks.after}
        badge={(u) => (photosB.has(u) ? [] : [ADDED])}
      />,
    ];
  } else {
    const pdf = field === "menu_url" || field === "menu";
    sides = [
      <Value key="b" value={before} pdf={pdf} label={label} />,
      <Value key="a" value={after} pdf={pdf} label={label} />,
    ];
  }

  return (
    <section className="space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-3 text-xs">
      <h3 className="break-words text-[13px] font-bold text-[#0F172A]">
        {label}
      </h3>
      {notes.length > 0 && (
        <p className="font-semibold text-[#B45309]">{notes.join(" · ")}</p>
      )}
      {/* Stacks below 1024 px; each side keeps its visible title. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Side title="მიმდინარე" tone="text-[#64748B]">
          {sides[0]}
        </Side>
        <Side title="შემოთავაზებული" tone="text-[#166534]">
          {sides[1]}
        </Side>
      </div>
    </section>
  );
}

function Side({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className={`text-[11px] font-bold uppercase ${tone}`}>{title}</p>
      {children}
    </div>
  );
}

function Rooms({
  raw,
  rooms,
  marks,
  badge,
}: {
  raw: unknown;
  rooms: HotelRoom[];
  marks: RoomMark[];
  badge: (url: string) => PhotoBadge[];
}) {
  return (
    <div className="space-y-2">
      {rooms.length === 0 && <p className="text-[#94A3B8]">—</p>}
      {rooms.map((room, i) => {
        const mark = marks[i];
        return (
          <div
            key={i}
            className="space-y-1.5 rounded-lg border border-[#F1F5F9] p-2"
          >
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[#0F172A] [overflow-wrap:anywhere]">
              {room.name}
              {mark && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ROOM_MARKS[mark].cls}`}
                >
                  {ROOM_MARKS[mark].text}
                </span>
              )}
            </p>
            <p className="text-[#475569]">{roomFacts(room)}</p>
            <PhotoStrip urls={room.photos} label={room.name} badges={badge} />
          </div>
        );
      })}
      {roomsLostData(raw, rooms) && (
        <>
          <p className="font-semibold text-[#B91C1C]">
            ზოგი ჩანაწერი არასწორი ფორმატისაა — სრული მნიშვნელობა:
          </p>
          <Raw value={raw} />
        </>
      )}
    </div>
  );
}

function Value({
  value,
  pdf,
  label,
  depth = 0,
}: {
  value: unknown;
  pdf: boolean;
  label: string;
  depth?: number;
}): ReactNode {
  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return <p className="text-[#94A3B8]">—</p>;
  }
  if (typeof value === "boolean") return <p>{value ? "კი" : "არა"}</p>;
  // Unformatted: formatters round, and the unit depends on the listing.
  if (typeof value === "number") return <p>{String(value)}</p>;
  if (typeof value === "string") {
    const safe = renderableImageUrl(value);
    if (safe && (pdf || isPdfUrl(safe))) {
      return (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[13px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
        >
          <FileText className="h-4 w-4 shrink-0" />
          PDF-ის გახსნა
        </a>
      );
    }
    if (safe) return <PhotoStrip urls={[safe]} label={label} />;
    return <p className="whitespace-pre-wrap break-words">{value}</p>;
  }
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string" || typeof v === "number")
  ) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <li
            key={i}
            className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[#334155] [overflow-wrap:anywhere]"
          >
            {String(v)}
          </li>
        ))}
      </ul>
    );
  }
  if (depth === 0 && typeof value === "object" && !Array.isArray(value)) {
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="grid gap-0.5">
            <dt className="font-semibold text-[#475569] [overflow-wrap:anywhere]">
              {fieldLabel(k)}
            </dt>
            <dd className="min-w-0">
              <Value value={v} pdf={pdf} label={fieldLabel(k)} depth={1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <Raw value={value} />;
}

function Raw({ value }: { value: unknown }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
