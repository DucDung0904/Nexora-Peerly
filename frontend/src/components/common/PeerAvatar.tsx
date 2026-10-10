import { useId } from "react";
export function PeerAvatar({
  variant = "self",
  size = "medium",
  className = "",
}: {
  variant?: "self" | "nova";
  size?: "small" | "medium" | "large";
  className?: string;
}) {
  const id = useId();
  const nova = variant === "nova";
  return (
    <span
      className={`peer-avatar avatar-${variant} avatar-${size} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id={id} x2="1" y2="1">
            <stop stopColor={nova ? "#f0ad8f" : "#c2b1ff"} />
            <stop offset="1" stopColor={nova ? "#a14ba3" : "#6053c8"} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={nova ? "#32233e" : "#282249"} />
        <circle
          cx="76"
          cy="22"
          r="23"
          fill={nova ? "#76425c" : "#44377f"}
          opacity=".65"
        />
        <path d="M10 100 Q13 66 50 65 Q87 66 90 100" fill={`url(#${id})`} />
        <path
          d="M28 40 Q28 16 50 16 Q75 17 73 43 L69 60 Q50 79 32 58Z"
          fill={nova ? "#f5bd9b" : "#cfb8ed"}
        />
        <path
          d={
            nova
              ? "M26 43 Q15 12 47 12 Q81 6 78 44 L68 32 Q46 42 35 27 L31 47Z"
              : "M26 42 Q18 12 48 12 Q79 7 75 44 L65 29 Q53 38 33 30 L30 46Z"
          }
          fill={nova ? "#38233d" : "#302346"}
        />
        <path
          d="M39 47h2m18 0h2"
          stroke="#362440"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M45 58 Q50 62 56 57"
          fill="none"
          stroke="#8d586f"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          cx="24"
          cy="72"
          r="4"
          fill={nova ? "#fbd6af" : "#eee3ff"}
          opacity=".7"
        />
      </svg>
    </span>
  );
}
