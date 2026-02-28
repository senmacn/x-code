"use client";

import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaPreviewModalProps {
  open: boolean;
  imageUrl?: string;
  imageAlt?: string;
  sourceUrl: string;
  onClose: () => void;
}

export const MediaPreviewModal = ({
  open,
  imageUrl,
  imageAlt,
  sourceUrl,
  onClose,
}: MediaPreviewModalProps) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl rounded-2xl bg-slate-900/95 border border-white/10 p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-slate-300 truncate pr-3">{imageAlt || "媒体预览"}</p>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "h-8 w-8 rounded-lg border border-white/15 text-slate-300",
                "hover:text-white hover:border-white/30 transition-colors"
              )}
              aria-label="关闭预览"
            >
              <X size={15} className="mx-auto" />
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img
              src={imageUrl}
              alt={imageAlt || "媒体大图预览"}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>

          <div className="mt-3 flex justify-end">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-sky-400/35 px-3 py-1.5 text-xs",
                "text-sky-200 hover:bg-sky-400/10 transition-colors"
              )}
            >
              前往 X 原帖
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
