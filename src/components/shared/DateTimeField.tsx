"use client";

import DateField, { toISODate } from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";

interface DateTimeFieldProps {
  value: string; // "YYYY-MM-DDTHH:MM" | ""
  onChange: (value: string) => void;
  clearable?: boolean;
  className?: string;
}

export default function DateTimeField({
  value,
  onChange,
  clearable,
  className,
}: DateTimeFieldProps) {
  const [datePart = "", timePart = ""] = value ? value.split("T") : [];

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <DateField
          value={datePart}
          clearable={clearable}
          className={className}
          onChange={(d) => onChange(d ? `${d}T${timePart || "00:00"}` : "")}
        />
      </div>
      <div className="w-[120px]">
        <TimeField
          value={timePart}
          className={className}
          onChange={(tm) =>
            onChange(`${datePart || toISODate(new Date())}T${tm}`)
          }
        />
      </div>
    </div>
  );
}
