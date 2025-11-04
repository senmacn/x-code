import cron from "node-cron";
import { logger } from "../utils/logger";

export function startScheduler(cronExp: string, task: () => Promise<void>) {
  if (!cron.validate(cronExp)) {
    throw new Error(`无效的 cron 表达式: ${cronExp}`);
  }
  logger.info({ cron: cronExp }, "定时任务已启动");
  cron.schedule(cronExp, () => {
    task().catch((e) => logger.error({ error: e?.message || String(e) }, "定时任务执行失败"));
  });
}