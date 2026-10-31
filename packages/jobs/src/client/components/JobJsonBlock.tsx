import { Card, CardContent, CardHeader, CardTitle } from "@groot/ui/card";
import { lazy, Suspense } from "react";

const CodeMirrorEditor = lazy(() =>
  import("@groot/shell/components/CodeMirrorEditor").then((m) => ({
    default: m.CodeMirrorEditor,
  })),
);

const READONLY_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
} as const;

/** A read-only, pretty-printed JSON block for a job's data or output. */
export function JobJsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border/60">
          <Suspense fallback={<div className="h-48" />}>
            <CodeMirrorEditor
              value={JSON.stringify(value, null, 2) ?? ""}
              editable={false}
              lineWrapping
              basicSetup={READONLY_SETUP}
            />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  );
}
