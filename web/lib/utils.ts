import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const relativeTime = (iso?: string): string => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: zhCN });
  } catch {
    return iso;
  }
};

export const absoluteTime = (iso?: string): string => {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
};

export const fromTimestamp = (ts?: number): string => {
  if (!ts) return "—";
  try {
    return format(new Date(ts), "yyyy-MM-dd HH:mm");
  } catch {
    return "—";
  }
};
