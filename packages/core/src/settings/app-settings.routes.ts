import { Hono } from "hono";
import { parseBody, parseStringParam } from "../utils/controller.utils";
import { ok, noContent } from "../utils/api-response.utils";
import * as appSettingsService from "./app-settings.service";
import { upsertAppSettingSchema } from "./app-settings.schema";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.get("/", async (c) => ok(c, await appSettingsService.getAll()));

router.get("/:key", async (c) => {
  const key = parseStringParam(c.req.param("key"), "key");
  return ok(c, await appSettingsService.get({ key }));
});

router.put("/:key", async (c) => {
  const key = parseStringParam(c.req.param("key"), "key");
  const payload = await parseBody(c, upsertAppSettingSchema);
  return ok(c, await appSettingsService.upsert({ key, data: payload }));
});

router.delete("/:key", async (c) => {
  const key = parseStringParam(c.req.param("key"), "key");
  await appSettingsService.deleteSetting({ key });
  return noContent(c);
});

export default router;
