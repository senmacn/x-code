"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../utils/logger");
function startScheduler(cronExp, task) {
    if (!node_cron_1.default.validate(cronExp)) {
        throw new Error(`无效的 cron 表达式: ${cronExp}`);
    }
    logger_1.logger.info({ cron: cronExp }, "定时任务已启动");
    node_cron_1.default.schedule(cronExp, () => {
        task().catch((e) => logger_1.logger.error({ error: e?.message || String(e) }, "定时任务执行失败"));
    });
}
//# sourceMappingURL=scheduler.js.map