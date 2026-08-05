import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification scheduler configuration", () => {
  it("does not register a per-minute cron on Vercel Hobby", () => {
    const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as { crons?: unknown[] };
    expect(config.crons).toBeUndefined();
  });

  it("keeps the one-minute worker schedule in Supabase Cron", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/202608050002_notification_cron.sql"),
      "utf8",
    );

    expect(migration).toContain("'* * * * *'");
    expect(migration).toContain("net.http_get");
    expect(migration).toContain("notification_cron_secret");
    expect(migration).toContain("private.configure_notification_cron()");
  });
});
