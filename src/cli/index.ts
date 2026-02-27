import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { loadConfig } from "../config";
import { getProxyAgent } from "../utils/proxy";
import { createXClient, getMyFollowings } from "../clients/xClient";
import TwitterApi from "twitter-api-v2";
import { Store } from "../data/store";
import { fetchForUsernames } from "../services/fetcher";
import { backfillMediaCache } from "../services/mediaCache";
import { startScheduler } from "../services/scheduler";
import { logger } from "../utils/logger";
import { truncate } from "../utils/text";

interface ShowArgs {
  user?: string;
  limit: number;
  since?: string;
  until?: string;
  contains?: string;
  lang?: string;
  users: boolean;
  json: boolean;
}

const handleShow = (store: Store, args: ShowArgs) => {
  if (args.users) {
    store.listUsers().forEach((u) => {
      console.log(`@${u.username}${u.name ? ` (${u.name})` : ""} [${u.id}]`);
    });
    return;
  }

  const rows = store.queryTweets({
    username: args.user,
    since: args.since,
    until: args.until,
    contains: args.contains,
    lang: args.lang,
    limit: args.limit,
  });

  if (args.json) {
    rows.forEach((r) => console.log(JSON.stringify(r)));
    return;
  }

  rows.forEach((r) => {
    console.log(`[${r.created_at ?? ""}] @${(r as any).username}: ${truncate(r.text, 280)}`);
  });
};

async function bootstrap() {
  const argv = yargs(hideBin(process.argv))
    .command("start", "启动定时拉取服务")
    .command("fetch-once", "立即拉取一次")
    .command(
      "backfill-media",
      "回填媒体缓存（默认处理 priorityUsernames）",
      (y: Argv) =>
        y
          .option("users", {
            type: "array",
            string: true,
            describe: "指定用户名列表（默认使用 priorityUsernames）",
          })
          .option("force", {
            type: "boolean",
            default: false,
            describe: "忽略 priorityUsernames，强制回填命中的推文",
          })
          .option("limit", { type: "number", default: 500, describe: "最多处理推文条数" })
    )
    .command(
      "show",
      "在终端显示已存储推文",
      (y: Argv) =>
        y
          .option("user", { type: "string", describe: "指定用户名" })
          .option("limit", { type: "number", default: 20, describe: "显示条数" })
          .option("since", { type: "string", describe: "起始时间（ISO，如 2024-01-01T00:00:00Z）" })
          .option("until", { type: "string", describe: "结束时间（ISO，如 2024-12-31T23:59:59Z）" })
          .option("contains", { type: "string", describe: "文本包含关键字" })
          .option("lang", { type: "string", describe: "语言代码（如 en、zh）" })
          .option("users", { type: "boolean", default: false, describe: "显示已跟踪的用户列表" })
          .option("json", { type: "boolean", default: false, describe: "以 JSON 行输出" })
    )
    .demandCommand(1)
    .help()
    .parseSync();

  const cmd = argv._[0] as string;
  const { config, secrets } = loadConfig();
  const store = new Store();

  // show 不需要 API 客户端，直接处理后退出
  if (cmd === "show") {
    handleShow(store, argv as unknown as ShowArgs);
    process.exit(0);
  }

  if (cmd === "backfill-media") {
    const inputUsers = ((argv as any).users as string[] | undefined)?.map((u) => String(u));
    const targetUsers =
      inputUsers && inputUsers.length
        ? inputUsers
        : config.priorityUsernames?.length
        ? config.priorityUsernames
        : config.staticUsernames;
    const force = Boolean((argv as any).force);
    const limit = Math.max(1, Math.min(5000, Number((argv as any).limit ?? 500)));
    const summary = await backfillMediaCache({
      store,
      config,
      usernames: targetUsers,
      limit,
      force,
    });
    logger.info(summary, "媒体回填完成");
    process.exit(0);
  }

  // 以下命令需要 API 客户端
  const agent = getProxyAgent(config.proxy);
  let client: TwitterApi;
  try {
    client = createXClient(secrets, agent);
  } catch (e: any) {
    logger.error({ error: e?.message || String(e) }, "缺少授权，无法访问 X API");
    process.exit(1);
  }

  const resolveUsernames = async (): Promise<string[]> => {
    if (config.mode === "static" && config.staticUsernames?.length) {
      return config.staticUsernames;
    }
    try {
      const followings = await getMyFollowings(client);
      logger.info({ count: followings.length }, "已获取关注列表");
      return followings;
    } catch (e: any) {
      logger.error({ error: e?.message || String(e) }, "获取关注列表失败，请检查授权");
      return config.staticUsernames ?? [];
    }
  };

  if (cmd === "fetch-once") {
    const usernames = await resolveUsernames();
    await fetchForUsernames(
      client,
      store,
      usernames,
      config.maxPerUser,
      config.concurrency,
      config
    );
    process.exit(0);
  }

  if (cmd === "start") {
    const task = async () => {
      const usernames = await resolveUsernames();
      await fetchForUsernames(
        client,
        store,
        usernames,
        config.maxPerUser,
        config.concurrency,
        config
      );
    };
    await task();
    startScheduler(config.schedule, task);
  }
}

bootstrap().catch((e) => {
  logger.error({ error: e?.message || String(e) }, "应用启动失败");
  process.exit(1);
});
