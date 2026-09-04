/** Small presentational primitives shared across the Edvana screens. */
import { CSSProperties, ReactNode } from "react";
import { T } from "./tokens";

export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: T.textSubtle,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  style,
  radius = 16,
}: {
  children: ReactNode;
  style?: CSSProperties;
  radius?: number;
}) {
  return (
    <div
      style={{
        background: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: radius,
        boxShadow: T.shadowSm,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

type BtnVariant = "primary" | "outline";
type BtnSize = "sm" | "md" | "lg";

export function Button({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled,
  style,
  type = "button",
}: {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  const pad = size === "sm" ? "7px 14px" : size === "lg" ? "13px 22px" : "9px 18px";
  const fontSize = size === "lg" ? 14 : 12.5;
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 9999,
    fontSize,
    fontWeight: 600,
    padding: pad,
    cursor: disabled ? "default" : "pointer",
    border: "1px solid transparent",
    fontFamily: "inherit",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: T.primary, color: T.white, borderColor: T.primary },
    outline: {
      background: T.white,
      color: T.ink,
      borderColor: T.border,
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="edv-transition"
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

/** Thin objective / score bar. */
export function ProgressBar({
  pct,
  fill,
  track = T.slate100,
  height = 6,
}: {
  pct: number;
  fill: string;
  track?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        background: track,
        borderRadius: 9999,
        height,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: fill,
          borderRadius: 9999,
        }}
      />
    </div>
  );
}

/** 2x2 style stat tile: big numeral over a muted label. */
export function StatTile({
  value,
  label,
}: {
  value: ReactNode;
  label: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${T.tileBorder}`,
        borderRadius: 12,
        padding: "11px 13px",
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
