"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

const WATCHDOG_MS = 12_000;

type Variant = "page" | "fullscreen" | "inline";

interface SkierLoaderProps {
  variant?: Variant;
  label?: string;
  className?: string;
}

export function SkierLoader({
  variant = "page",
  label,
  className,
}: SkierLoaderProps) {
  const t = useTranslations("Shared");
  const resolvedLabel = label ?? t("loading");
  const wrapperClass = wrapperByVariant[variant];
  const skierWidth = variant === "inline" ? "w-32" : "w-56";
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (variant === "inline") return;
    const id = setTimeout(() => setStuck(true), WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [variant]);

  return (
    <div className={[wrapperClass, className].filter(Boolean).join(" ")}>
      <div className="flex flex-col items-center gap-6">
        <div className={`${skierWidth} relative translate-y-2`}>
          <SkierSvg />
        </div>
        {variant !== "inline" && resolvedLabel ? (
          <div className="flex items-end gap-1">
            <span className="text-xl font-medium leading-none tracking-tight text-slate-800 md:text-2xl">
              {resolvedLabel}
            </span>
            <span className="ml-1 flex gap-1 pb-1">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"
                style={{ animationDelay: "200ms" }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"
                style={{ animationDelay: "400ms" }}
              />
            </span>
          </div>
        ) : null}
      </div>
      {stuck && variant !== "inline" ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-slate-500">{t("stillLoading")}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#2563EB] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1D4ED8]"
          >
            {t("reload")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SkierLoader;

const wrapperByVariant: Record<Variant, string> = {
  page: "flex min-h-[60vh] w-full flex-col items-center justify-center px-6 py-12",
  fullscreen:
    "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 px-6 backdrop-blur-sm",
  inline: "flex w-full flex-col items-center justify-center py-4",
};

// Deterministic pseudo-random in [0, 1) derived from an index + seed so the
// SSR and CSR output is identical (no hydration mismatch / flash).
const rand = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function SkierSvg() {
  const prefersReducedMotion = useReducedMotion();

  const particles = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        cx: 100 + rand(i, 1) * 60,
        cy: 350 + rand(i, 2) * 15,
        r: rand(i, 3) * 5 + 3,
        delay: rand(i, 4) * 0.8,
        duration: 0.6 + rand(i, 5) * 0.4,
        scale: 1.5 + rand(i, 6) * 2,
        x: -100 - rand(i, 7) * 80,
        y: -20 - rand(i, 8) * 30,
      })),
    [],
  );

  const speedLines = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, i) => ({
        id: i,
        y: 50 + rand(i, 9) * 400,
        length: 60 + rand(i, 10) * 150,
        delay: rand(i, 11) * 1.5,
        duration: 0.6 + rand(i, 12) * 0.6,
        strokeWidth: rand(i, 13) * 3 + 2,
      })),
    [],
  );

  const animateOr = <T,>(value: T): T | undefined =>
    prefersReducedMotion ? undefined : value;

  return (
    <div className="relative mx-auto flex aspect-square w-full items-center justify-center">
      <motion.svg
        viewBox="0 0 500 500"
        className="h-full w-full drop-shadow-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <defs>
          <linearGradient
            id="goggleReflection"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        <g transform="rotate(12 250 250) translate(20, -40)">
          {!prefersReducedMotion &&
            speedLines.map((line) => (
              <motion.line
                key={`sl-${line.id}`}
                x1={600}
                y1={line.y}
                x2={600 + line.length}
                y2={line.y}
                stroke="rgba(148,163,184,0.3)"
                strokeWidth={line.strokeWidth}
                strokeLinecap="round"
                initial={{ x: 0 }}
                animate={{ x: -1200 }}
                transition={{
                  repeat: Infinity,
                  duration: line.duration,
                  delay: line.delay,
                  ease: "linear",
                }}
              />
            ))}

          {!prefersReducedMotion &&
            particles.map((p) => (
              <motion.circle
                key={`p-${p.id}`}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill="#cbd5e1"
                opacity={0}
                animate={{
                  opacity: [0.8, 0],
                  x: [0, p.x],
                  y: [0, p.y],
                  scale: [1, p.scale],
                }}
                transition={{
                  repeat: Infinity,
                  duration: p.duration,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}

          <motion.g
            animate={animateOr({ y: [0, 10, 0] })}
            transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
          >
            <motion.path
              animate={animateOr({
                d: [
                  "M 320 150 Q 250 140 180 160",
                  "M 320 150 Q 230 160 180 150",
                  "M 320 150 Q 250 140 180 160",
                ],
              })}
              d="M 320 150 Q 250 140 180 160"
              transition={{
                repeat: Infinity,
                duration: 0.4,
                ease: "easeInOut",
              }}
              stroke="#991b1b"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
            />

            <motion.g
              style={{ transformOrigin: "320px 140px" }}
              animate={animateOr({ rotate: [-10, 20, -10] })}
              transition={{
                repeat: Infinity,
                duration: 0.9,
                ease: "easeInOut",
              }}
            >
              <line
                x1="330"
                y1="210"
                x2="210"
                y2="340"
                stroke="#cbd5e1"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse
                cx="220"
                cy="326"
                rx="10"
                ry="3"
                fill="#475569"
                transform="rotate(-40 220 326)"
              />
              <path
                d="M 320 140 L 335 180 L 330 210"
                stroke="#c2410c"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="330" cy="210" r="11" fill="#020617" />
            </motion.g>
          </motion.g>

          <path
            d="M 60 340 L 400 340 C 420 340, 430 330, 435 310"
            stroke="#94a3b8"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="200" y="325" width="28" height="15" rx="6" fill="#0f172a" />
          <motion.path
            d="M 220 220 L 280 270 L 210 340"
            animate={animateOr({
              d: [
                "M 220 220 L 280 270 L 210 340",
                "M 220 230 L 290 280 L 210 340",
                "M 220 220 L 280 270 L 210 340",
              ],
            })}
            transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
            stroke="#0f172a"
            strokeWidth="32"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          <motion.g
            animate={animateOr({ y: [0, 10, 0] })}
            transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
          >
            <line
              x1="320"
              y1="140"
              x2="220"
              y2="220"
              stroke="#ea580c"
              strokeWidth="50"
              strokeLinecap="round"
            />
            <line
              x1="310"
              y1="140"
              x2="210"
              y2="220"
              stroke="#f97316"
              strokeWidth="15"
              strokeLinecap="round"
            />

            <motion.path
              d="M 320 150 Q 270 160 210 180"
              animate={animateOr({
                d: [
                  "M 320 150 Q 270 160 210 180",
                  "M 320 150 Q 250 180 200 170",
                  "M 320 150 Q 270 160 210 180",
                ],
              })}
              transition={{
                repeat: Infinity,
                duration: 0.5,
                ease: "easeInOut",
              }}
              stroke="#ef4444"
              strokeWidth="20"
              strokeLinecap="round"
              fill="none"
            />

            <g>
              <path
                d="M 340 82 A 28 28 0 0 1 368 110 L 340 110 Z"
                fill="#fcd34d"
              />
              <circle cx="340" cy="110" r="28" fill="#1e293b" />
              <path d="M 355 85 Q 365 95 365 110 L 340 110 Z" fill="#334155" />
              <line
                x1="312"
                y1="108"
                x2="345"
                y2="108"
                stroke="#0f172a"
                strokeWidth="7"
              />
              <rect
                x="340"
                y="100"
                width="28"
                height="15"
                rx="6"
                fill="url(#goggleReflection)"
                stroke="#0284c7"
                strokeWidth="2"
              />
            </g>
          </motion.g>

          <rect x="235" y="335" width="30" height="15" rx="6" fill="#1e293b" />
          <motion.path
            d="M 220 220 L 300 280 L 250 350"
            animate={animateOr({
              d: [
                "M 220 220 L 300 280 L 250 350",
                "M 220 230 L 310 290 L 250 350",
                "M 220 220 L 300 280 L 250 350",
              ],
            })}
            transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
            stroke="#1e293b"
            strokeWidth="35"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M 80 350 L 420 350 C 445 350, 455 335, 460 315"
            stroke="#cbd5e1"
            strokeWidth="16"
            strokeLinecap="round"
            fill="none"
          />

          <motion.g
            animate={animateOr({ y: [0, 10, 0] })}
            transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
          >
            <motion.g
              style={{ transformOrigin: "320px 140px" }}
              animate={animateOr({ rotate: [20, -10, 20] })}
              transition={{
                repeat: Infinity,
                duration: 0.9,
                ease: "easeInOut",
              }}
            >
              <line
                x1="340"
                y1="220"
                x2="240"
                y2="375"
                stroke="#94a3b8"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <ellipse
                cx="250"
                cy="355"
                rx="12"
                ry="4"
                fill="#64748b"
                transform="rotate(-40 250 355)"
              />
              <path
                d="M 320 140 L 350 185 L 340 220"
                stroke="#fb923c"
                strokeWidth="22"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="340" cy="220" r="13" fill="#0f172a" />
            </motion.g>
          </motion.g>
        </g>
      </motion.svg>
    </div>
  );
}
