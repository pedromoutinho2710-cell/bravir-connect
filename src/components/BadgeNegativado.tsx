import { AlertCircle } from "lucide-react";

export function BadgeNegativado() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> Negativado
    </span>
  );
}
