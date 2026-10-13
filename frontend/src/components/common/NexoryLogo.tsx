import { useId } from "react";
import type { SVGProps } from "react";

type MarkProps = SVGProps<SVGSVGElement> & { title?: string };

export function NexoryMark({ title, ...props }: MarkProps) {
  const reactId = useId();
  const id = `nexory-mark-${reactId.replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="7" y1="38" x2="40" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9B7BFF" />
          <stop offset="1" stopColor="#56E0D0" />
        </linearGradient>
      </defs>
      <path d="M10 37V12.5c0-2.3 3-3.2 4.3-1.3L33.7 37c1.3 1.9 4.3 1 4.3-1.3V11" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="11" r="4" fill="#B69BFF" />
      <circle cx="38" cy="11" r="4" fill="#67E5D3" />
    </svg>
  );
}

export function NexoryLogo({ className = "", title }: { className?: string; title?: string }) {
  return (
    <span className={`nexory-logo ${className}`.trim()} role={title ? "img" : undefined} aria-label={title}>
      <NexoryMark className="nexory-logo-mark" />
      <span className="nexory-logo-type">
        <span>Nexory</span><span className="nexory-logo-peerly">Peerly</span>
      </span>
    </span>
  );
}
