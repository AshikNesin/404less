import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider } from "@groot/ui/primitives";
import { jobsApi } from "@groot/jobs/client/api";
import { JobsTable } from "@groot/jobs/client/components/JobsTable";
import type { Job, JobState } from "@groot/jobs/client/types";

vi.mock("@groot/jobs/client/api", () => ({
  jobsApi: { rerunJobs: vi.fn(), retryJob: vi.fn(), deleteJob: vi.fn() },
}));

function job(id: string, state: JobState = "completed"): Job {
  const now = new Date().toISOString();
  return {
    id,
    name: "report",
    data: null,
    state,
    priority: 0,
    retryLimit: 0,
    retryCount: 0,
    retryDelay: 0,
    runAt: now,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    output: null,
    error: null,
    singletonKey: null,
  };
}

const JOBS = [job("aaaaaaaa-1"), job("bbbbbbbb-2", "failed"), job("cccccccc-3", "active")];

function renderTable(jobs: Job[] = JOBS) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmProvider>
        <MemoryRouter>
          <JobsTable
            jobs={jobs}
            total={jobs.length}
            loading={false}
            queryParams={{ state: "all", page: 0 }}
            setQueryParams={() => {}}
          />
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

const row = (shortId: string) => screen.getByRole("row", { name: `Job report (${shortId})` });

beforeEach(() => vi.clearAllMocks());

describe("JobsTable", () => {
  it("renders one named row per job", () => {
    renderTable();
    expect(screen.getAllByRole("row", { name: /^Job report/ })).toHaveLength(3);
    expect(within(row("aaaaaa")).getByRole("link")).toHaveAttribute("href", "/jobs/aaaaaaaa-1");
  });

  it("selects rows by id and re-runs the selection after confirming", async () => {
    vi.mocked(jobsApi.rerunJobs).mockResolvedValue([
      { jobId: "aaaaaaaa-1", success: true, newJobId: "n1" },
      { jobId: "cccccccc-3", success: true, newJobId: "n3" },
    ]);
    const user = userEvent.setup();
    renderTable();

    await user.click(within(row("aaaaaa")).getByRole("checkbox"));
    await user.click(within(row("cccccc")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Rerun 2" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Re-run" }));

    expect(jobsApi.rerunJobs).toHaveBeenCalledWith(["aaaaaaaa-1", "cccccccc-3"]);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Rerun/ })).toBeNull());
  });

  it("selects and clears every row with select all", async () => {
    const user = userEvent.setup();
    renderTable();
    const selectAll = screen.getByRole("checkbox", { name: "Select all" });

    await user.click(selectAll);
    expect(screen.getByRole("button", { name: "Rerun 3" })).toBeInTheDocument();
    expect(within(row("bbbbbb")).getByRole("checkbox")).toBeChecked();

    await user.click(selectAll);
    expect(screen.queryByRole("button", { name: /^Rerun/ })).toBeNull();
  });

  it("offers the actions the job's state allows and confirms delete", async () => {
    vi.mocked(jobsApi.deleteJob).mockResolvedValue();
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Actions for job report (bbbbbb)" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Retry", "Re-run", "Delete"]);

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(jobsApi.deleteJob).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(jobsApi.deleteJob).toHaveBeenCalledWith("bbbbbbbb-2");
  });
});
