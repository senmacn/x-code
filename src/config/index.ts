import fs from "fs";
import path from "path";
import { z } from "zod";
import dotenv from "dotenv";
import { AppConfig, EnvSecrets } from "../data/types";
import { logger } from "../utils/logger";

dotenv.config();

const ConfigSchema = z.object({
  mode: z.enum(["static", "dynamic"]).default("static"),
  staticUsernames: z.array(z.string()).optional(),
  schedule: z.string().default("*/5 * * * *"),
  proxy: z.string().optional(),
  maxPerUser: z.number().int().min(1).default(20),
  concurrency: z.number().int().min(1).max(10).default(3),
});

function resolveConfigPath(): string {
  const configPath = path.join(process.cwd(), "config.json");
  return fs.existsSync(configPath) ? configPath : path.join(process.cwd(), "config.default.json");
}

export function saveConfig(config: AppConfig): void {
  const configPath = path.join(process.cwd(), "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function loadConfig(): { config: AppConfig; secrets: EnvSecrets } {
  const configPath = resolveConfigPath();
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error({ errors: parsed.error.format() }, "配置文件校验失败");
    throw new Error("Invalid configuration");
  }

  const envProxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  const config: AppConfig = {
    ...parsed.data,
    proxy: parsed.data.proxy ?? envProxy,
  };

  const secrets: EnvSecrets = {
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_SECRET: process.env.X_ACCESS_SECRET,
  };

  return { config, secrets };
}
