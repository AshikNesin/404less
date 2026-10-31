import { lazy, Suspense } from "react";

const CodeMirrorEditor = lazy(() =>
  import("@groot/shell/components/CodeMirrorEditor").then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);

/** JSON payload editor shared by the add-job and schedule dialogs. */
export function JobDataEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-input">
      <Suspense fallback={<div className="h-[200px]" />}>
        <CodeMirrorEditor value={value} height="200px" onChange={onChange} />
      </Suspense>
    </div>
  );
}
