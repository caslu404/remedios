import { Pill } from "lucide-react";

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? " small" : ""}`} aria-hidden="true">
      <Pill strokeWidth={2.4} />
    </span>
  );
}
