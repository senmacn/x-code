import { ExternalLink } from "lucide-react";
import type { Tweet } from "@/lib/types";
import { relativeTime, absoluteTime } from "@/lib/utils";

const TWITTER_BLUE = "text-blue-500";

const highlightEntities = (text: string): React.ReactNode => {
  // Highlight @mentions and #hashtags
  const parts = text.split(/(@\w+|#\w+)/g);
  return parts.map((part, i) =>
    part.match(/^(@|#)/) ? (
      <span key={i} className={TWITTER_BLUE}>
        {part}
      </span>
    ) : (
      part
    )
  );
};

interface TweetCardProps {
  tweet: Tweet;
  compact?: boolean;
}

interface TweetMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif" | string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
  local_url?: string;
  local_path?: string;
  cache_error?: string;
}

const parseMedia = (tweet: Tweet): TweetMedia[] => {
  if (!tweet.media_json) return [];
  try {
    const parsed = JSON.parse(tweet.media_json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is TweetMedia => !!m && typeof m === "object");
  } catch {
    return [];
  }
};

const isImageUrl = (url?: string): boolean => {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return (
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".png") ||
    clean.endsWith(".webp") ||
    clean.endsWith(".gif")
  );
};

export const TweetCard = ({ tweet, compact = false }: TweetCardProps) => {
  const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.id}`;
  const mediaItems = parseMedia(tweet);
  const visibleMedia = compact ? mediaItems.slice(0, 1) : mediaItems.slice(0, 4);

  return (
    <div className="surface-card p-4 hover:border-slate-300 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {tweet.username[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {tweet.user_name || tweet.username}
            </p>
            <p className="text-xs text-slate-400">@{tweet.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-slate-400 cursor-default"
            title={absoluteTime(tweet.created_at)}
          >
            {relativeTime(tweet.created_at)}
          </span>
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-sky-500 transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Body */}
      <p
        className={`text-sm text-slate-800 leading-relaxed whitespace-pre-wrap ${
          compact ? "line-clamp-3" : ""
        }`}
      >
        {highlightEntities(tweet.text)}
      </p>

      {visibleMedia.length > 0 && (
        <div
          className={`mt-3 grid gap-2 ${
            visibleMedia.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {visibleMedia.map((media, idx) => {
            const cachedPreview =
              media.type === "photo" || isImageUrl(media.local_url) ? media.local_url : undefined;
            const previewUrl =
              cachedPreview ||
              (media.type === "photo" ? media.url : media.preview_image_url || media.url);
            if (!previewUrl) return null;
            return (
              <a
                key={`${media.media_key}-${idx}`}
                href={tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block overflow-hidden rounded-xl border border-slate-200"
              >
                <img
                  src={previewUrl}
                  alt={media.alt_text || `${tweet.username} 的推文媒体`}
                  loading="lazy"
                  className={`w-full object-cover transition-transform group-hover:scale-[1.02] ${
                    compact ? "h-40" : "h-52"
                  }`}
                />
                {media.type !== "photo" && (
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">
                    {media.type === "video" ? "视频预览" : "GIF 预览"}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* Lang badge */}
      {tweet.lang && tweet.lang !== "und" && (
        <span className="mt-2 inline-block text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {tweet.lang}
        </span>
      )}
    </div>
  );
};
