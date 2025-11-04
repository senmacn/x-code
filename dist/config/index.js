"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../utils/logger");
dotenv_1.default.config();
const ConfigSchema = zod_1.z.object({
    mode: zod_1.z.enum(["static", "dynamic"]).default("static"),
    staticUsernames: zod_1.z.array(zod_1.z.string()).optional(),
    schedule: zod_1.z.string().default("*/5 * * * *"),
    proxy: zod_1.z.string().optional(),
    maxPerUser: zod_1.z.number().int().min(1).default(20),
    concurrency: zod_1.z.number().int().min(1).max(10).default(3),
});
function loadConfig() {
    const configPath = resolveConfigPath();
    const raw = fs_1.default.existsSync(configPath)
        ? JSON.parse(fs_1.default.readFileSync(configPath, "utf-8"))
        : JSON.parse(fs_1.default.readFileSync(path_1.default.join(process.cwd(), "config.default.json"), "utf-8"));
    const parsed = ConfigSchema.safeParse(raw);
    if (!parsed.success) {
        logger_1.logger.error({ errors: parsed.error.format() }, "配置文件校验失败");
        throw new Error("Invalid configuration");
    }
    const envProxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    const config = {
        ...parsed.data,
        proxy: parsed.data.proxy ?? envProxy,
    };
    const secrets = {
        X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
        X_API_KEY: process.env.X_API_KEY,
        X_API_SECRET: process.env.X_API_SECRET,
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
        X_ACCESS_SECRET: process.env.X_ACCESS_SECRET,
    };
    return { config, secrets };
}
function resolveConfigPath() {
    const candidates = [
        path_1.default.join(process.cwd(), "config.json"),
    ];
    for (const c of candidates) {
        if (fs_1.default.existsSync(c))
            return c;
    }
    return path_1.default.join(process.cwd(), "config.default.json");
}
//# sourceMappingURL=index.js.map