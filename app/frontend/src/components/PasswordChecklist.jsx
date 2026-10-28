import { PASSWORD_RULES } from "@/lib/password";
import { Check, X } from "lucide-react";

export default function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1" data-testid="password-checklist">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password || "");
        return (
          <li
            key={rule.key}
            data-testid={`pw-rule-${rule.key}`}
            className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? "text-emerald-600" : "text-slate-400"}`}
          >
            {ok ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
