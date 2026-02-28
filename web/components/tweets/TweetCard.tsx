"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ReferencedTweet, Tweet, TweetReference } from "@/lib/types";
import { relativeTime, absoluteTime } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { MediaPreviewModal } from "@/components/tweets/MediaPreviewModal";

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
  timeDisplayMode?: "relative" | "absolute";
  onToggleTimeDisplay?: () => void;
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
  return parseMediaJson(tweet.media_json);
};

const parseMediaJson = (mediaJson?: string): TweetMedia[] => {
  if (!mediaJson) return [];
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is TweetMedia => !!m && typeof m === "object");
  } catch {
    return [];
  }
};

const parseReferencedTweetId = (url?: string): string | undefined => {
  if (!url) return undefined;
  const match = url.match(/(?:x\.com|twitter\.com)\/(?:[^/]+|i\/web)\/status\/(\d+)/i);
  return match?.[1];
};

const buildDisplayText = (tweet: Tweet): string => {
  const references = tweet.references ?? [];
  if (!references.length || !tweet.entities_json) return tweet.text;
  const refIds = new Set(references.map((ref) => ref.ref_tweet_id));
  let text = tweet.text;
  try {
    const entities = JSON.parse(tweet.entities_json) as {
      urls?: Array<{ url?: string; expanded_url?: string }>;
    };
    for (const item of entities.urls ?? []) {
      const refId = parseReferencedTweetId(item.expanded_url);
      if (!refId || !refIds.has(refId) || !item.url) continue;
      text = text.replace(item.url, "");
    }
  } catch {
    return tweet.text;
  }
  return text.replace(/\s{2,}/g, " ").trim();
};

const getReferenceLabel = (refType: string): string => {
  if (refType === "quoted") return "引用推文";
  if (refType === "replied_to") return "回复对象";
  if (refType === "retweeted") return "转发来源";
  return "相关推文";
};

const buildReferenceUrl = (reference: TweetReference): string => {
  if (reference.url) return reference.url;
  if (reference.tweet.username) {
    return `https://x.com/${reference.tweet.username}/status/${reference.ref_tweet_id}`;
  }
  return `https://x.com/i/web/status/${reference.ref_tweet_id}`;
};

const parseRefMedia = (refTweet: ReferencedTweet): TweetMedia[] =>
  parseMediaJson(refTweet.media_json).slice(0, 1);

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

export const TweetCard = ({
  tweet,
  compact = false,
  timeDisplayMode = "relative",
  onToggleTimeDisplay,
}: TweetCardProps) => {
  const [preview, setPreview] = useState<{
    imageUrl: string;
    imageAlt: string;
    sourceUrl: string;
  } | null>(null);

  const canToggleTime = typeof onToggleTimeDisplay === "function";
  const useAbsoluteTime = timeDisplayMode === "absolute";
  const formatTime = (iso?: string) =>
    useAbsoluteTime ? absoluteTime(iso) : relativeTime(iso);

  const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.id}`;
  const displayText = buildDisplayText(tweet) || tweet.text;
  const mediaItems = parseMedia(tweet);
  const visibleMedia = compact ? mediaItems.slice(0, 1) : mediaItems.slice(0, 4);
  const references = compact
    ? (tweet.references ?? []).slice(0, 1)
    : (tweet.references ?? []).slice(0, 3);

  return (
    <div className="surface-card p-4 hover:border-slate-300 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserAvatar
            username={tweet.username}
            name={tweet.user_name}
            avatarUrl={tweet.user_avatar_url}
            size="md"
          />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {tweet.user_name || tweet.username}
            </p>
            <p className="text-xs text-slate-400">@{tweet.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canToggleTime ? (
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              title={useAbsoluteTime ? "点击切换为相对时间" : "点击切换为详细时间"}
              onClick={onToggleTimeDisplay}
            >
              {formatTime(tweet.created_at)}
            </button>
          ) : (
            <span className="text-xs text-slate-400 cursor-default">
              {formatTime(tweet.created_at)}
            </span>
          )}
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
        {highlightEntities(displayText)}
      </p>

      {references.length > 0 && (
        <div className="mt-3 space-y-2">
          {references.map((reference) => {
            const refTweet = reference.tweet;
            const refUrl = buildReferenceUrl(reference);
            const unavailable = Boolean(refTweet.unavailable_reason) || !refTweet.text;
            const refMedia = parseRefMedia(refTweet);
            const refPreview =
              refMedia.length && (refMedia[0].local_url || refMedia[0].url || refMedia[0].preview_image_url);
            return (
              <div
                key={`${tweet.id}-${reference.ref_tweet_id}-${reference.source}`}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">{getReferenceLabel(reference.ref_type)}</p>
                  <a
                    href={refUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-sky-500 transition-colors"
                    aria-label="查看引用原帖"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
                {unavailable ? (
                  <p className="text-sm text-slate-500">引用推文不可用或暂未回填</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">
                      @{refTweet.username || "unknown"}
                      {refTweet.created_at ? ` · ${formatTime(refTweet.created_at)}` : ""}
                    </p>
                    <p className="text-sm text-slate-700 mt-1 line-clamp-3">{refTweet.text}</p>
                    {refPreview && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreview({
                            imageUrl: refPreview,
                            imageAlt: "引用推文媒体预览",
                            sourceUrl: refUrl,
                          })
                        }
                        className="mt-2 block w-full"
                      >
                        <img
                          src={refPreview}
                          alt="引用推文媒体预览"
                          loading="lazy"
                          className="h-28 w-full rounded-lg object-cover border border-slate-200"
                        />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

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
              <button
                type="button"
                key={`${media.media_key}-${idx}`}
                className="group relative block overflow-hidden rounded-xl border border-slate-200"
                onClick={() =>
                  setPreview({
                    imageUrl: previewUrl,
                    imageAlt: media.alt_text || `${tweet.username} 的推文媒体`,
                    sourceUrl: tweetUrl,
                  })
                }
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
              </button>
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

      <MediaPreviewModal
        open={Boolean(preview)}
        imageUrl={preview?.imageUrl}
        imageAlt={preview?.imageAlt}
        sourceUrl={preview?.sourceUrl || tweetUrl}
        onClose={() => setPreview(null)}
      />
    </div>
  );
};
