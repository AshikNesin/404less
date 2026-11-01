// Subrequest accounting for the crawl tick. Workers Free allows 50 outbound
// fetches per invocation; a fetch past that throws, which a link check would
// otherwise record as a broken link. Inside `withSubrequestBudget()` every
// crawler fetch is counted, and once the budget is spent the next one throws
// `SubrequestBudgetSpent` instead: the tick stops and the unfinished task runs
// again on the next tick. Outside a budget (the recheck endpoint, tests) the
// fetches are not counted.
import { AsyncLocalStorage } from "node:async_hooks";

export class SubrequestBudgetSpent extends Error {
  constructor() {
    super("crawl subrequest budget spent");
    this.name = "SubrequestBudgetSpent";
  }
}

type Budget = { left: number };

const current = new AsyncLocalStorage<Budget>();

export function withSubrequestBudget<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  return current.run({ left: limit }, fn);
}

/** Fetches left in the running budget (Infinity outside one). */
export function subrequestsLeft(): number {
  return current.getStore()?.left ?? Number.POSITIVE_INFINITY;
}

/** `fetch()` counted against the running budget. */
export function crawlerFetch(input: string, init?: RequestInit): Promise<Response> {
  const budget = current.getStore();
  if (budget) {
    if (budget.left <= 0) return Promise.reject(new SubrequestBudgetSpent());
    budget.left--;
  }
  return fetch(input, init);
}

/** Rethrow a spent budget from a catch that would otherwise swallow it. */
export function rethrowIfBudgetSpent(error: unknown): void {
  if (error instanceof SubrequestBudgetSpent) throw error;
}
