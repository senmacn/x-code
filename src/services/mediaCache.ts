import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { MediaObjectV2 } from "twitter-api-v2";
import type { AppConfig } from "../data/types";
import {
  Store,
  type MediaAssetUpsert,
  type TweetMediaLinkInput,
} from "../data/store";
import { logger } from "../utils/logger";

export interface CachedMediaObject extends MediaObjectV2 {
  source_url?: string;
  local_path?: string;
  local_url?: string;
  cached_at?: string;
  cache_error?: string;
}

export interface MediaBackfillSummary {
  scannedTweets: number;
  updatedTweets: number;
  cachedFiles: number;
  failedFiles: number;
  offset: number;
}

export interface MediaBackfillProgress {
  offset: number;
  scannedTweets: number;
  updatedTweets: number;
  cachedFiles: number;
  failedFiles: number;
  limit: number;
  usernames: string[];
  force: boolean;
  running: boolean;
}

export interface MediaCleanupSummary {
  scannedAssets: number;
  deletedAssets: number;
  deletedFiles: number;
  missingFiles: number;
  releasedBytes: number;
  diskUsageBefore: number;
  diskUsageAfter: number;
  updatedTweets: number;
  ttlEvictions: number;
  capacityEvictions: number;
}

interface CleanupPlanAsset {
  source_hash: string;
  file_size: number;
  last_accessed_at?: number;
  created_at?: number;
}

export interface CleanupPlanResult {
  expiredHashes: string[];
  capacityHashes: string[];
  deleteHashes: string[];
  diskUsageBefore: number;
  diskUsageAfter: number;
}

const DEFAULT_MEDIA_CACHE = {
  enabled: true,
  rootDir: "media-cache",
  cacheForPriorityOnly: true,
  includeVideoFiles: false,
  requestTimeoutMs: 12000,
  maxDiskUsage: 2048,
  ttlDays: 30,
  cleanupCron: "0 * * * *",
} as const;

const normalizeUsername = (value: string) => value.replace(/^@/, "").trim();

const normalizeUsernameList = (list?: string[]) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const clean = normalizeUsername(String(raw));
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
};

const getMediaCacheConfig = (config: AppConfig) => ({
  ...DEFAULT_MEDIA_CACHE,
  ...(config.mediaCache ?? {}),
});

const toPosixPath = (value: string) => value.split(path.sep).join("/");

const buildLocalUrl = (relativePath: string) =>
  `/api/media-cache/${toPosixPath(relativePath).split("/").map(encodeURIComponent).join("/")}`;

const fileExists = async (filePath: string) => {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const guessExtFromUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).replace(".", "").toLowerCase();
    if (ext && ext.length <= 5) return ext;

    const format = (parsed.searchParams.get("format") ?? parsed.searchParams.get("fm") ?? "")
      .replace(".", "")
      .toLowerCase();
    if (format && format.length <= 5) return format;
    return undefined;
  } catch {
    return undefined;
  }
};

const isVideoVariantSource = (media: MediaObjectV2, sourceUrl: string): boolean => {
  if (media.type !== "video" && media.type !== "animated_gif") return false;
  return (media.variants ?? []).some(
    (v) => v.content_type === "video/mp4" && v.url === sourceUrl
  );
};

const guessExtFromMedia = (media: MediaObjectV2, sourceUrl: string): string => {
  if (media.type === "photo") return "jpg";
  if (isVideoVariantSource(media, sourceUrl)) return "mp4";
  return "jpg";
};

const selectSourceUrl = (media: MediaObjectV2, includeVideoFiles: boolean): string | undefined => {
  if (media.type === "photo" && media.url) return media.url;

  if (includeVideoFiles && (media.type === "video" || media.type === "animated_gif")) {
    const mp4 = (media.variants ?? [])
      .filter((v) => v.content_type === "video/mp4" && !!v.url)
      .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0];
    if (mp4?.url) return mp4.url;
  }

  return media.preview_image_url || media.url;
};

const downloadMedia = async (
  sourceUrl: string,
  absPath: string,
  timeoutMs: number
): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "x-code-media-cache/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = await res.arrayBuffer();
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    await fsp.writeFile(absPath, Buffer.from(body));
  } finally {
    clearTimeout(timer);
  }
};

const parseMediaJson = (value?: string): CachedMediaObject[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is CachedMediaObject => !!m && typeof m === "object");
  } catch {
    return [];
  }
};

const getProjectRoot = () => path.resolve(process.cwd());

const ensureProjectScopedRoot = (candidateDir: string): string => {
  const root = getProjectRoot();
  const safeCandidate = path.resolve(candidateDir);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (safeCandidate === root || safeCandidate.startsWith(rootPrefix)) {
    return safeCandidate;
  }

  const fallback = path.join(root, DEFAULT_MEDIA_CACHE.rootDir);
  logger.warn({ configured: candidateDir, fallback }, "媒体缓存目录越界，已回退到项目目录内");
  return fallback;
};

const toDiskLimitBytes = (maxDiskUsageMb: number): number =>
  Math.max(0, Math.floor(maxDiskUsageMb * 1024 * 1024));

const hashSourceUrl = (sourceUrl: string): string =>
  crypto.createHash("sha1").update(sourceUrl).digest("hex");

const buildAssetRelativePath = (sourceHash: string, ext: string): string => {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "bin";
  return `${sourceHash.slice(0, 2)}/${sourceHash}.${safeExt}`;
};

const toCleanupSortableTs = (asset: CleanupPlanAsset) =>
  asset.last_accessed_at ?? asset.created_at ?? 0;

export const resolveMediaCacheRoot = (config: AppConfig) => {
  const mediaCfg = getMediaCacheConfig(config);
  return ensureProjectScopedRoot(path.resolve(getProjectRoot(), mediaCfg.rootDir));
};

export const shouldCacheMediaForUser = (config: AppConfig, username: string): boolean => {
  const mediaCfg = getMediaCacheConfig(config);
  if (!mediaCfg.enabled) return false;
  if (!mediaCfg.cacheForPriorityOnly) return true;
  const priority = normalizeUsernameList(config.priorityUsernames).map((u) => u.toLowerCase());
  if (priority.length === 0) return false;
  return priority.includes(normalizeUsername(username).toLowerCase());
};

export const planAssetCleanup = (params: {
  now: number;
  ttlDays: number;
  maxDiskUsageBytes: number;
  assets: CleanupPlanAsset[];
}): CleanupPlanResult => {
  const { now, ttlDays, maxDiskUsageBytes, assets } = params;
  const cutoff = ttlDays > 0 ? now - ttlDays * 24 * 60 * 60 * 1000 : -1;

  const usageByHash = new Map<string, number>();
  for (const asset of assets) {
    usageByHash.set(asset.source_hash, Math.max(0, Math.floor(asset.file_size || 0)));
  }

  const diskUsageBefore = Array.from(usageByHash.values()).reduce((sum, size) => sum + size, 0);

  const expiredHashes = assets
    .filter((asset) => cutoff >= 0 && toCleanupSortableTs(asset) <= cutoff)
    .map((asset) => asset.source_hash);

  const deleteSet = new Set(expiredHashes);
  let remainingUsage = diskUsageBefore;
  for (const hash of deleteSet) {
    remainingUsage -= usageByHash.get(hash) ?? 0;
  }

  const capacityHashes: string[] = [];
  if (maxDiskUsageBytes > 0 && remainingUsage > maxDiskUsageBytes) {
    const candidates = assets
      .filter((asset) => !deleteSet.has(asset.source_hash))
      .sort((a, b) => toCleanupSortableTs(a) - toCleanupSortableTs(b));

    for (const asset of candidates) {
      if (remainingUsage <= maxDiskUsageBytes) break;
      if (deleteSet.has(asset.source_hash)) continue;
      deleteSet.add(asset.source_hash);
      capacityHashes.push(asset.source_hash);
      remainingUsage -= usageByHash.get(asset.source_hash) ?? 0;
    }
  }

  const deleteHashes = Array.from(deleteSet);
  return {
    expiredHashes,
    capacityHashes,
    deleteHashes,
    diskUsageBefore,
    diskUsageAfter: Math.max(0, remainingUsage),
  };
};

const stripLocalMediaFields = (media: CachedMediaObject): CachedMediaObject => {
  const next: CachedMediaObject = { ...media };
  delete next.local_path;
  delete next.local_url;
  delete next.cached_at;
  delete next.cache_error;
  return next;
};

const shouldStripForEviction = (media: CachedMediaObject, hashes: Set<string>, mediaKeys: Set<string>) => {
  if (media.source_url && hashes.has(hashSourceUrl(media.source_url))) return true;
  if (media.media_key && mediaKeys.has(media.media_key)) return true;
  return false;
};

export const cacheMediaForTweet = async (params: {
  store?: Store;
  config: AppConfig;
  username: string;
  tweetId: string;
  media: MediaObjectV2[];
  force?: boolean;
}): Promise<{ media: CachedMediaObject[]; cachedFiles: number; failedFiles: number; changed: boolean }> => {
  const { config, username, tweetId, force = false, store } = params;
  const mediaCfg = getMediaCacheConfig(config);
  if (!mediaCfg.enabled || (!force && !shouldCacheMediaForUser(config, username))) {
    return { media: params.media as CachedMediaObject[], cachedFiles: 0, failedFiles: 0, changed: false };
  }

  const rootDir = resolveMediaCacheRoot(config);
  await fsp.mkdir(rootDir, { recursive: true });

  let cachedFiles = 0;
  let failedFiles = 0;
  const nextMedia: CachedMediaObject[] = [];
  const upsertAssets = new Map<string, MediaAssetUpsert>();
  const tweetMediaLinks: TweetMediaLinkInput[] = [];

  for (let i = 0; i < params.media.length; i += 1) {
    const media = params.media[i];
    const sourceUrl = selectSourceUrl(media, mediaCfg.includeVideoFiles);
    if (!sourceUrl) {
      nextMedia.push(media as CachedMediaObject);
      continue;
    }

    const sourceHash = hashSourceUrl(sourceUrl);
    const ext = guessExtFromUrl(sourceUrl) || guessExtFromMedia(media, sourceUrl);
    const relativePath = buildAssetRelativePath(sourceHash, ext);
    const absPath = path.join(rootDir, relativePath);
    const mediaKey = media.media_key || `${media.type || "media"}_${i}`;
    const now = Date.now();
    const out: CachedMediaObject = {
      ...media,
      source_url: sourceUrl,
      local_path: relativePath,
      local_url: buildLocalUrl(relativePath),
      cached_at: new Date(now).toISOString(),
    };

    let fileSize = 0;
    let cacheError: string | null = null;

    try {
      const exists = await fileExists(absPath);
      if (!exists) {
        await downloadMedia(sourceUrl, absPath, mediaCfg.requestTimeoutMs);
        cachedFiles += 1;
      }
      const stat = await fsp.stat(absPath);
      fileSize = stat.size;
      delete out.cache_error;
    } catch (error: any) {
      failedFiles += 1;
      const message = error?.message || String(error);
      cacheError = message;
      delete out.local_path;
      delete out.local_url;
      delete out.cached_at;
      out.cache_error = message;
      logger.warn(
        { username, tweetId, mediaKey: media.media_key, sourceUrl, error: out.cache_error },
        "媒体缓存失败"
      );
    }

    upsertAssets.set(sourceHash, {
      source_hash: sourceHash,
      source_url: sourceUrl,
      media_type: media.type,
      media_key: media.media_key,
      file_ext: ext,
      mime_type:
        media.type === "video" || media.type === "animated_gif" ? "video/mp4" : "image/jpeg",
      relative_path: relativePath,
      file_size: fileSize,
      last_accessed_at: now,
      last_cached_at: fileSize > 0 ? now : undefined,
      cache_error: cacheError,
    });

    tweetMediaLinks.push({
      source_hash: sourceHash,
      media_key: mediaKey,
      sort_order: i,
    });

    nextMedia.push(out);
  }

  if (store) {
    store.upsertMediaAssets(Array.from(upsertAssets.values()));
    store.replaceTweetMediaLinks(tweetId, tweetMediaLinks);
  }

  const changed = JSON.stringify(params.media) !== JSON.stringify(nextMedia);
  return { media: nextMedia, cachedFiles, failedFiles, changed };
};

export const cleanupMediaCache = async (params: {
  store: Store;
  config: AppConfig;
  nowMs?: number;
}): Promise<MediaCleanupSummary> => {
  const { store, config, nowMs = Date.now() } = params;
  const mediaCfg = getMediaCacheConfig(config);
  const rootDir = resolveMediaCacheRoot(config);
  await fsp.mkdir(rootDir, { recursive: true });

  const assets = store.listMediaAssets();
  const assetsByHash = new Map(assets.map((asset) => [asset.source_hash, asset]));
  const missingHashes = new Set<string>();
  const planAssets: CleanupPlanAsset[] = [];

  for (const asset of assets) {
    const absPath = path.join(rootDir, asset.relative_path);
    try {
      const stat = await fsp.stat(absPath);
      if (!stat.isFile()) {
        missingHashes.add(asset.source_hash);
        continue;
      }
      planAssets.push({
        source_hash: asset.source_hash,
        file_size: stat.size,
        last_accessed_at: asset.last_accessed_at,
        created_at: asset.created_at,
      });
    } catch {
      missingHashes.add(asset.source_hash);
    }
  }

  const plan = planAssetCleanup({
    now: nowMs,
    ttlDays: mediaCfg.ttlDays,
    maxDiskUsageBytes: toDiskLimitBytes(mediaCfg.maxDiskUsage),
    assets: planAssets,
  });

  const deleteSet = new Set<string>([...missingHashes, ...plan.deleteHashes]);
  if (deleteSet.size === 0) {
    return {
      scannedAssets: assets.length,
      deletedAssets: 0,
      deletedFiles: 0,
      missingFiles: 0,
      releasedBytes: 0,
      diskUsageBefore: plan.diskUsageBefore,
      diskUsageAfter: plan.diskUsageAfter,
      updatedTweets: 0,
      ttlEvictions: plan.expiredHashes.length,
      capacityEvictions: plan.capacityHashes.length,
    };
  }

  const deleteHashes = Array.from(deleteSet);
  const links = store.listTweetMediaLinksBySourceHashes(deleteHashes);
  const byTweet = new Map<
    string,
    {
      hashes: Set<string>;
      mediaKeys: Set<string>;
    }
  >();

  for (const link of links) {
    const current = byTweet.get(link.tweet_id) ?? { hashes: new Set<string>(), mediaKeys: new Set<string>() };
    current.hashes.add(link.source_hash);
    if (link.media_key) current.mediaKeys.add(link.media_key);
    byTweet.set(link.tweet_id, current);
  }

  let updatedTweets = 0;
  const tweetRows = store.getTweetMediaRowsByIds(Array.from(byTweet.keys()));
  for (const tweetRow of tweetRows) {
    const hit = byTweet.get(tweetRow.id);
    if (!hit) continue;

    const currentMedia = parseMediaJson(tweetRow.media_json);
    if (!currentMedia.length) continue;

    let changed = false;
    const nextMedia = currentMedia.map((media) => {
      if (!shouldStripForEviction(media, hit.hashes, hit.mediaKeys)) return media;
      changed = true;
      return stripLocalMediaFields(media);
    });

    if (changed) {
      store.updateTweetMediaJson(tweetRow.id, JSON.stringify(nextMedia));
      updatedTweets += 1;
    }
  }

  let deletedFiles = 0;
  let releasedBytes = 0;
  for (const hash of deleteHashes) {
    const asset = assetsByHash.get(hash);
    if (!asset) continue;
    const absPath = path.join(rootDir, asset.relative_path);
    try {
      const stat = await fsp.stat(absPath);
      if (stat.isFile()) {
        await fsp.unlink(absPath);
        deletedFiles += 1;
        releasedBytes += stat.size;
      }
    } catch {
      // 文件缺失属于幂等场景，继续清理数据库映射
    }
  }

  store.deleteMediaAssetsBySourceHashes(deleteHashes);

  const diskUsageAfter = Math.max(0, plan.diskUsageBefore - releasedBytes);
  return {
    scannedAssets: assets.length,
    deletedAssets: deleteHashes.length,
    deletedFiles,
    missingFiles: missingHashes.size,
    releasedBytes,
    diskUsageBefore: plan.diskUsageBefore,
    diskUsageAfter,
    updatedTweets,
    ttlEvictions: plan.expiredHashes.length,
    capacityEvictions: plan.capacityHashes.length,
  };
};

export const backfillMediaCache = async (params: {
  store: Store;
  config: AppConfig;
  usernames?: string[];
  limit?: number;
  force?: boolean;
  resume?: Partial<MediaBackfillProgress>;
  onProgress?: (progress: MediaBackfillProgress) => void;
}): Promise<MediaBackfillSummary> => {
  const { store, config, limit = 500, force = false } = params;
  const usernames = normalizeUsernameList(params.usernames);
  const chunkSize = 100;
  let offset = Math.max(0, Math.floor(params.resume?.offset ?? 0));
  const summary: MediaBackfillSummary = {
    scannedTweets: Math.max(0, Math.floor(params.resume?.scannedTweets ?? 0)),
    updatedTweets: Math.max(0, Math.floor(params.resume?.updatedTweets ?? 0)),
    cachedFiles: Math.max(0, Math.floor(params.resume?.cachedFiles ?? 0)),
    failedFiles: Math.max(0, Math.floor(params.resume?.failedFiles ?? 0)),
    offset,
  };
  const emitProgress = (running: boolean) => {
    params.onProgress?.({
      offset,
      scannedTweets: summary.scannedTweets,
      updatedTweets: summary.updatedTweets,
      cachedFiles: summary.cachedFiles,
      failedFiles: summary.failedFiles,
      limit,
      usernames,
      force,
      running,
    });
  };
  emitProgress(true);

  while (summary.scannedTweets < limit) {
    const rows = store.listTweetsWithMedia({
      usernames: usernames.length ? usernames : undefined,
      limit: Math.min(chunkSize, limit - summary.scannedTweets),
      offset,
    });
    if (rows.length === 0) break;
    offset += rows.length;
    summary.offset = offset;
    summary.scannedTweets += rows.length;

    for (const row of rows) {
      const media = parseMediaJson(row.media_json);
      if (media.length === 0) continue;

      const result = await cacheMediaForTweet({
        store,
        config,
        username: row.username,
        tweetId: row.id,
        media,
        force,
      });

      summary.cachedFiles += result.cachedFiles;
      summary.failedFiles += result.failedFiles;
      if (result.changed) {
        store.updateTweetMediaJson(row.id, JSON.stringify(result.media));
        summary.updatedTweets += 1;
      }
    }
    emitProgress(true);
  }

  emitProgress(false);
  return summary;
};
