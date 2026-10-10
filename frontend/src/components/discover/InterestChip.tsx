import {
  Code2,
  Gamepad2,
  Music2,
  Sparkles,
  Clapperboard,
  BookOpen,
  Dribbble,
  Palette,
  Check,
} from "lucide-react";
import type { Interest } from "../../types/session";
const icons = {
  Technology: Code2,
  Gaming: Gamepad2,
  Music: Music2,
  Anime: Sparkles,
  Movies: Clapperboard,
  Books: BookOpen,
  Sports: Dribbble,
  Art: Palette,
};
export function InterestChip({
  interest,
  selected,
  onClick,
}: {
  interest: Interest;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Icon = icons[interest];
  const content = (
    <>
      <Icon size={15} />
      {interest}
      {selected && onClick && <Check className="chip-check" size={12} />}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`interest-chip ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={`interest-chip static ${selected ? "selected" : ""}`}>
      {content}
    </span>
  );
}
