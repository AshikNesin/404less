export type Site = {
  id: string;
  team_id: string;
  name: string;
  domain: string;
  site_key: string;
  ignore_status_codes: number[];
  exclude_patterns: string[];
  notify_enabled: number;
  digest_minutes: number;
  created_at: number;
};

export type Event = {
  id: string;
  url: string;
  referrer: string | null;
  user_agent: string | null;
  ts: number;
};

export type Channel = {
  id: string;
  type: 'slack' | 'pushover' | 'email';
  name: string;
  enabled: number;
  created_at: number;
};

export type Team = { id: string; name: string; owner_user_id: string; created_at: number };
