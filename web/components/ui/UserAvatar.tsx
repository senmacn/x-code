"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username?: string;
  name?: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

const initialFrom = (username?: string, name?: string) =>
  (name?.trim()[0] || username?.trim()[0] || "?").toUpperCase();

export const UserAvatar = ({
  username,
  name,
  avatarUrl,
  size = "md",
  className,
}: UserAvatarProps) => {
  const fallback = initialFrom(username, name);
  const hasImage = Boolean(avatarUrl);

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden flex items-center justify-center font-bold text-white",
        hasImage ? "bg-slate-200" : "bg-gradient-to-br from-sky-500 to-indigo-600",
        SIZE_CLASS[size],
        className
      )}
      style={!hasImage ? ({ lineHeight: 1 } as CSSProperties) : undefined}
    >
      {hasImage ? (
        <img
          src={avatarUrl}
          alt={`${username || "user"} avatar`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
};
