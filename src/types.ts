// Shared Worker bindings & types.
export type Env = {
  DB: D1Database;
  MAX_SITES_PER_TEAM?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

export type AuthContext = {
  userId: string;
  email: string;
};
