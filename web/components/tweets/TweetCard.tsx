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

export const TweetCard = ({ tweet, compact = false }: TweetCardProps) => {
  const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.id}`;

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

      {/* Lang badge */}
      {tweet.lang && tweet.lang !== "und" && (
        <span className="mt-2 inline-block text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {tweet.lang}
        </span>
      )}
    </div>
  );
};
