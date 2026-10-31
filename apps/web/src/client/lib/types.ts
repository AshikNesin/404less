// API shapes (mirror src/server/features/*/service.ts).

export type LinkStatus = "open" | "resolved" | "ignored";
export type LinkSource = "visitor" | "crawler" | "both";

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
  crawl_enabled: number;
  crawl_max_pages: number;
  last_crawl_at: number | null;
  created_at: number;
  open_links: number;
  hits_7d: number;
  last_hit_at: number | null;
};

export type BrokenLink = {
  id: string;
  website_id: string;
  url: string;
  status: LinkStatus;
  source: LinkSource;
  hits: number;
  http_status: number | null;
  first_seen: number;
  last_seen: number;
  resolved_at: number | null;
  title: string | null;
  suggested_url: string | null;
  suggested_title: string | null;
  source_pages: number;
  found_on: string | null;
  found_on_title: string | null;
};

export type LinksPage = {
  links: BrokenLink[];
  total: number;
  counts: Record<LinkStatus, number>;
  page: number;
  limit: number;
};

export type Suggestion = { url: string; title: string | null; score: number };

export type LinkDetail = {
  link: Omit<BrokenLink, "source_pages" | "found_on">;
  suggestions: Suggestion[];
  referrers: { referrer: string; n: number }[];
  sources: { source_url: string; source_title: string | null; anchor: string | null }[];
  lastCheck: {
    status: number;
    checkedAt: number;
    chain: { url: string; status: number }[] | null;
  } | null;
  series: { day: string; hits: number }[];
  recent: { referrer: string | null; user_agent: string | null; ts: number }[];
};

export type Overview = {
  counts: Record<LinkStatus, number>;
  series: { day: string; hits: number }[];
  hits7d: number;
  hitsPrev7d: number;
  topOpen: {
    id: string;
    url: string;
    source: LinkSource;
    hits: number;
    http_status: number | null;
    last_seen: number;
    title: string | null;
    suggested_url: string | null;
    suggested_title: string | null;
    source_pages: number;
  }[];
  recent: { id: string; url: string; referrer: string | null; ts: number }[];
  crawl: {
    lastCrawlAt: number | null;
    lastCheckAt: number | null;
    checked: number;
    broken: number;
    running: boolean;
  };
  knownUrls: number;
  channels: number;
};

export type CrawlRow = {
  url: string;
  status: number;
  ok: number;
  redirect_chain: string | null;
  checked_at: number;
  link_id: string | null;
  link_status: LinkStatus | null;
  found_on: string | null;
  found_on_title: string | null;
};

export type KnownUrl = {
  url: string;
  title: string | null;
  title_checked_at: number | null;
  source: string;
  added_at: number;
};
export type KnownUrlStats = {
  total: number;
  crawled: number;
  from_sitemap: number;
  titled: number;
  last_added: number | null;
};

export type Event = {
  id: string;
  url: string;
  referrer: string | null;
  user_agent: string | null;
  ts: number;
  title?: string | null;
};

export type Channel = {
  id: string;
  type: "slack" | "pushover" | "email";
  name: string;
  enabled: number;
  created_at: number;
};

export type Team = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: number;
  role: "owner" | "admin" | "viewer";
};
export type Me = { user: { id: string; email: string; created_at: number }; teams: Team[] };
export type ApiKey = { id: string; prefix: string; created_at: number };
