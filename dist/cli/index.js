"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const config_1 = require("../config");
const proxy_1 = require("../utils/proxy");
const xClient_1 = require("../clients/xClient");
const store_1 = require("../data/store");
const fetcher_1 = require("../services/fetcher");
const scheduler_1 = require("../services/scheduler");
const logger_1 = require("../utils/logger");
const text_1 = require("../utils/text");
async function bootstrap() {
    const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
        .command("start", "启动定时拉取服务")
        .command("fetch-once", "立即拉取一次")
        .command("show", "在终端显示已存储推文", (y) => y
        .option("user", { type: "string", describe: "指定用户名" })
        .option("limit", { type: "number", default: 20, describe: "显示条数" })
        .option("since", { type: "string", describe: "起始时间（ISO，如 2024-01-01T00:00:00Z）" })
        .option("until", { type: "string", describe: "结束时间（ISO，如 2024-12-31T23:59:59Z）" })
        .option("contains", { type: "string", describe: "文本包含关键字" })
        .option("lang", { type: "string", describe: "语言代码（如 en、zh）" })
        .option("users", { type: "boolean", default: false, describe: "显示已跟踪的用户列表" })
        .option("json", { type: "boolean", default: false, describe: "以 JSON 行输出" }))
        .demandCommand(1)
        .help()
        .parseSync();
    const { config, secrets } = (0, config_1.loadConfig)();
    const store = new store_1.Store();
    async function resolveUsernames() {
        if (config.mode === "static" && config.staticUsernames?.length) {
            return config.staticUsernames;
        }
        // dynamic mode
        try {
            const followings = await (0, xClient_1.getMyFollowings)(client);
            logger_1.logger.info({ count: followings.length }, "已获取关注列表");
            return followings;
        }
        catch (e) {
            logger_1.logger.error({ error: e?.message || String(e) }, "获取关注列表失败，请检查授权");
            return config.staticUsernames ?? [];
        }
    }
    const cmd = (argv._[0] || "start");
    if (cmd === "show") {
        const a = argv;
        if (a.users) {
            const users = store.listUsers();
            for (const u of users) {
                console.log(`@${u.username}${u.name ? ` (${u.name})` : ""} [${u.id}]`);
            }
            process.exit(0);
        }
        const rows = store.queryTweets({
            username: a.user,
            since: a.since,
            until: a.until,
            contains: a.contains,
            lang: a.lang,
            limit: a.limit,
        });
        if (a.json) {
            for (const r of rows) {
                console.log(JSON.stringify(r));
            }
            process.exit(0);
        }
        for (const r of rows) {
            console.log(`[${r.created_at ?? ""}] @${r.username}: ${(0, text_1.truncate)(r.text, 280)}`);
        }
        process.exit(0);
    }
    // For commands requiring API access, create client after handling show
    const agent = (0, proxy_1.getProxyAgent)(config.proxy);
    let client;
    try {
        client = (0, xClient_1.createXClient)(secrets, agent);
    }
    catch (e) {
        logger_1.logger.error({ error: e?.message || String(e) }, "缺少授权，无法访问 X API");
        process.exit(1);
    }
    if (cmd === "fetch-once") {
        const usernames = await resolveUsernames();
        await (0, fetcher_1.fetchForUsernames)(client, store, usernames, config.maxPerUser, config.concurrency);
        process.exit(0);
    }
    // show handled above
    if (cmd === "start") {
        const task = async () => {
            const usernames = await resolveUsernames();
            await (0, fetcher_1.fetchForUsernames)(client, store, usernames, config.maxPerUser, config.concurrency);
        };
        // 立即执行一次
        await task();
        // 启动定时
        (0, scheduler_1.startScheduler)(config.schedule, task);
    }
}
bootstrap().catch((e) => {
    logger_1.logger.error({ error: e?.message || String(e) }, "应用启动失败");
    process.exit(1);
});
//# sourceMappingURL=index.js.map