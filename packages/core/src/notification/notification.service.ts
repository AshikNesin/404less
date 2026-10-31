import { env } from "../env";
import { logger } from "../logger";

/**
 * Pushover notifications over plain `fetch`, so the same code runs on Node
 * and Workers. Silently skipped when the Pushover keys are not configured.
 */
export interface PushNotification {
  title: string;
  message: string;
  /** Pushover priority: -2 (lowest) .. 2 (emergency). */
  priority?: -2 | -1 | 0 | 1 | 2;
  url?: string;
  urlTitle?: string;
}

export async function sendPushNotification(notification: PushNotification): Promise<boolean> {
  if (!env.PUSHOVER_USER_KEY || !env.PUSHOVER_API_TOKEN) {
    logger.debug("Pushover keys not configured, skipping push notification");
    return false;
  }

  const body = new URLSearchParams({
    token: env.PUSHOVER_API_TOKEN,
    user: env.PUSHOVER_USER_KEY,
    title: notification.title,
    message: notification.message,
    priority: String(notification.priority ?? 0),
    ...(notification.url ? { url: notification.url } : {}),
    ...(notification.urlTitle ? { url_title: notification.urlTitle } : {}),
  });

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Pushover request failed with status ${response.status}`);
  }
  return true;
}

export async function sendServerStartupNotification(port: number, nodeEnv: string): Promise<void> {
  await sendPushNotification({
    title: "Server started",
    message: `Server is running on port ${port} in ${nodeEnv} mode`,
  });
}

export const notificationService = { sendPushNotification, sendServerStartupNotification };
