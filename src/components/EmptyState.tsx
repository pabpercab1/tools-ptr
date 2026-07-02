export function EmptyState({
  message,
  tone,
}: {
  message: string;
  tone?: "error";
}) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border p-10 text-center text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {message}
    </div>
  );
}