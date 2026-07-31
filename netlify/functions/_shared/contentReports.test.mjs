import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTENT_REPORT_DUPLICATE_MESSAGE,
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_SUCCESS_MESSAGE,
  canReportContent,
  createContentReport,
  createContentReportSingleFlight,
  isMissingContentReportsSchemaError,
  readContentReports,
  updateContentReport,
  validateContentReportInput,
} from "../../../src/contentReports.js";

const migrationPath = "supabase/migrations/20260731164819_add_content_reports.sql";
const marker = "-- 20260731164819_add_content_reports.sql\n";
const migrationSql = readFileSync(migrationPath, "utf8").trim();
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const appSource = readFileSync("src/App.jsx", "utf8");
const dialogSource = readFileSync("src/ContentReportDialog.jsx", "utf8");
const adminSource = readFileSync("src/ObservationStationAdmin.jsx", "utf8");
const verificationSql = readFileSync("docs/content-reports-verification.sql", "utf8");

test("report input keeps reason keys separate from user-facing labels", () => {
  assert.deepEqual(
    CONTENT_REPORT_REASONS.map((reason) => reason.key),
    [
      "harassment",
      "hate_or_abuse",
      "sexual_content",
      "violence_or_danger",
      "self_harm",
      "impersonation",
      "spam_or_fraud",
      "personal_information",
      "copyright",
      "other",
    ],
  );
  assert.equal(
    validateContentReportInput({
      details: "   ",
      reason: "harassment",
      targetId: "post-a",
      targetType: "post",
    }).details,
    null,
  );
  assert.equal(
    validateContentReportInput({
      details: "a".repeat(1001),
      reason: "harassment",
      targetId: "post-a",
      targetType: "post",
    }).valid,
    false,
  );
  assert.equal(
    validateContentReportInput({
      details: "補足",
      reason: "",
      targetId: "post-a",
      targetType: "post",
    }).error,
    "理由を選んでください。",
  );
});

test("self-owned content is excluded without reusing black-hole protection", () => {
  assert.equal(
    canReportContent({
      currentUserId: "profile-a",
      targetId: "post-a",
      targetOwnerId: "profile-a",
    }),
    false,
  );
  assert.equal(
    canReportContent({
      currentUserId: "profile-a",
      targetId: "post-b",
      targetOwnerId: "profile-b",
    }),
    true,
  );
  assert.equal(canReportContent({ currentUserId: null, targetId: "post-b", targetOwnerId: "profile-b" }), false);
});

test("createContentReport sends no reporter id or client snapshot", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return {
        data: [{ outcome: "created", report_id: "report-a" }],
        error: null,
      };
    },
  };

  const result = await createContentReport(client, {
    details: "  確認してください  ",
    reason: "other",
    reporterId: "forged-profile",
    snapshot: { forged: true },
    targetId: "post-a",
    targetType: "post",
  });

  assert.deepEqual(result, { outcome: "created", reportId: "report-a" });
  assert.deepEqual(calls, [
    {
      args: {
        p_details: "確認してください",
        p_reason: "other",
        p_target_id: "post-a",
        p_target_type: "post",
      },
      name: "create_content_report",
    },
  ]);
  assert.equal("reporter_id" in calls[0].args, false);
  assert.equal("snapshot" in calls[0].args, false);
});

test("duplicate outcome is a normal client result with the exact message", async () => {
  const result = await createContentReport(
    {
      async rpc() {
        return {
          data: [{ outcome: "already_reported", report_id: "report-a" }],
          error: null,
        };
      },
    },
    {
      details: "",
      reason: "spam_or_fraud",
      targetId: "profile-b",
      targetType: "profile",
    },
  );

  assert.equal(result.outcome, "already_reported");
  assert.equal(CONTENT_REPORT_DUPLICATE_MESSAGE, "この内容はすでに観測局へ伝えています。");
  assert.equal(CONTENT_REPORT_SUCCESS_MESSAGE, "観測局へ伝えました。\nご協力ありがとうございます。");
});

test("submission single-flight shares one in-flight operation", async () => {
  let operationCalls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const guard = createContentReportSingleFlight();
  const operation = async () => {
    operationCalls += 1;
    await pending;
    return "created";
  };

  const first = guard.run(operation);
  const second = guard.run(operation);
  release();

  assert.equal(await first, "created");
  assert.equal(await second, "created");
  assert.equal(operationCalls, 1);
});

test("admin readers and mutations use only RPC contracts", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });

      if (name === "get_content_reports") {
        return {
          data: [
            {
              created_at: "2026-08-01T00:00:00Z",
              reason: "harassment",
              report_id: "report-a",
              report_status: "open",
              reporter_original_id: "profile-a",
              snapshot: { body: "snapshot" },
              target_original_id: "post-a",
              target_report_count: 2,
              target_type: "post",
            },
          ],
          error: null,
        };
      }

      return {
        data: [
          {
            outcome: "updated",
            report_id: "report-a",
            report_status: "reviewing",
            resolution_note: "確認中",
            reviewed_at: "2026-08-01T01:00:00Z",
            reviewed_by: "admin-a",
          },
        ],
        error: null,
      };
    },
  };

  const reports = await readContentReports(client, { status: "open" });
  const updated = await updateContentReport(client, {
    reportId: "report-a",
    resolutionNote: " 確認中 ",
    status: "reviewing",
  });

  assert.equal(reports[0].targetReportCount, 2);
  assert.equal(updated.status, "reviewing");
  assert.deepEqual(calls, [
    {
      args: { p_limit: 100, p_status: "open" },
      name: "get_content_reports",
    },
    {
      args: {
        p_report_id: "report-a",
        p_resolution_note: "確認中",
        p_status: "reviewing",
      },
      name: "update_content_report",
    },
  ]);
});

test("missing report schema errors are fail-soft and narrowly classified", () => {
  assert.equal(isMissingContentReportsSchemaError({ code: "42P01" }), true);
  assert.equal(
    isMissingContentReportsSchemaError({
      code: "PGRST202",
      message: "Could not find function public.create_content_report",
    }),
    true,
  );
  assert.equal(isMissingContentReportsSchemaError({ code: "42501" }), false);
});

test("content_reports preserves targets, validates payloads, and has supporting indexes", () => {
  assert.match(migrationSql, /create table public\.content_reports/);
  assert.match(migrationSql, /reporter_id uuid references public\.profiles\(id\) on delete set null/);
  assert.match(migrationSql, /target_post_id uuid references public\.posts\(id\) on delete set null/);
  assert.match(migrationSql, /target_profile_id uuid references public\.profiles\(id\) on delete set null/);
  assert.match(migrationSql, /target_original_id uuid not null/);
  assert.match(migrationSql, /jsonb_typeof\(snapshot\) = 'object'/);
  assert.match(migrationSql, /char_length\(details\) <= 1000/);
  assert.match(migrationSql, /content_reports_reporter_target_reason_created_idx/);
  assert.match(migrationSql, /content_reports_status_created_idx/);
  assert.match(migrationSql, /content_reports_target_created_idx/);
  assert.match(migrationSql, /content_reports_reporter_id_idx/);
});

test("create RPC authenticates, creates the snapshot, and serializes 24-hour dedupe", () => {
  const functionBlock = migrationSql
    .split("create or replace function public.create_content_report")[1]
    ?.split("$$;")[0] ?? "";

  assert.match(functionBlock, /security definer[\s\S]*set search_path = ''/);
  assert.match(functionBlock, /v_reporter_id uuid := auth\.uid\(\)/);
  assert.match(functionBlock, /post\.visibility = 'public'[\s\S]*post\.deleted_at is null/);
  assert.match(functionBlock, /v_target_author_id = v_reporter_id/);
  assert.match(functionBlock, /v_target_profile\.id = v_reporter_id/);
  assert.match(functionBlock, /jsonb_build_object/);
  assert.match(functionBlock, /from public\.post_media media/);
  assert.match(functionBlock, /\/object\/sign\//);
  assert.match(functionBlock, /x-amz-signature/);
  assert.match(functionBlock, /pg_advisory_xact_lock[\s\S]*hashtextextended/);
  assert.match(functionBlock, /report\.created_at >= now\(\) - interval '24 hours'/);
  assert.doesNotMatch(functionBlock, /p_reporter_id|p_snapshot/);
});

test("reports are deny-all tables for browsers while RPC execution is explicit", () => {
  assert.match(
    migrationSql,
    /alter table public\.content_reports enable row level security/,
  );
  assert.match(
    migrationSql,
    /revoke all on table public\.content_reports from public, anon, authenticated/,
  );
  assert.doesNotMatch(migrationSql, /create policy[^;]*content_reports/i);
  assert.doesNotMatch(
    migrationSql,
    /grant[^;]*(select|insert|update|delete)[^;]*content_reports[^;]*(anon|authenticated)/i,
  );

  for (const signature of [
    "public.create_content_report(text, uuid, text, text)",
    "public.get_content_reports(text, integer)",
    "public.update_content_report(uuid, text, text)",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`revoke all on function ${signature.replace(/[().]/g, "\\$&")}[\\s\\S]*to authenticated, service_role`),
    );
  }
});

test("admin RPCs reuse app_admins and keep review audit fields server-owned", () => {
  for (const functionName of ["get_content_reports", "update_content_report"]) {
    const functionBlock = migrationSql
      .split(`create or replace function public.${functionName}`)[1]
      ?.split("$$;")[0] ?? "";
    assert.match(functionBlock, /security definer[\s\S]*set search_path = ''/);
    assert.match(functionBlock, /not public\.is_app_admin\(\)/);
  }

  assert.match(
    migrationSql,
    /reviewed_at = now\(\)[\s\S]*reviewed_by = v_user_id/,
  );
  assert.doesNotMatch(appSource, /from\("content_reports"\)/);
});

test("report creation has no notification, push, blocking, or moderation side effects", () => {
  const functionBlock = migrationSql
    .split("create or replace function public.create_content_report")[1]
    ?.split("$$;")[0] ?? "";

  assert.doesNotMatch(functionBlock, /notifications|push_notification_jobs|profile_blocks/);
  assert.doesNotMatch(functionBlock, /delete from public\.posts|update public\.posts/);
  assert.doesNotMatch(functionBlock, /is_black_hole_protected|is_black_hole_between/);
  assert.doesNotMatch(migrationSql, /create trigger[\s\S]*content_reports/i);
});

test("UI exposes the exact report language, self guards, modal access, and admin-only route", () => {
  assert.match(appSource, /観測局へ異常を伝える/);
  assert.match(appSource, /targetType: "post"/);
  assert.match(appSource, /targetType: "profile"/);
  assert.match(appSource, /canReportContent\(/);
  assert.match(appSource, /profile\.guideIsAdmin && profile\.observationStation\?\.available/);
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /event\.key === "Escape"/);
  assert.match(dialogSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(dialogSource, /maxLength=\{CONTENT_REPORT_DETAILS_MAX_LENGTH\}/);
  assert.doesNotMatch(`${appSource}\n${dialogSource}`, /通報する/);
  assert.doesNotMatch(adminSource, /dangerouslySetInnerHTML/);
});

test("verification SQL checks secrecy, RPC grants, indexes, snapshots, and plans", () => {
  for (const token of [
    "03_no_browser_table_privileges",
    "04_no_browser_policies",
    "05_required_indexes",
    "06_security_definer_search_path",
    "07_anon_cannot_execute",
    "08_authenticated_rpc_grants",
    "09_snapshot_is_object",
    "11_no_report_notifications",
    "explain (costs true, verbose false)",
  ]) {
    assert.equal(verificationSql.includes(token), true, `verification missing ${token}`);
  }
  assert.doesNotMatch(verificationSql, /insert into|update public|delete from/i);
});

test("migration and schema.sql stay byte-for-byte synchronized", () => {
  const schemaBlock = schemaSql.split(marker)[1]?.trim();
  assert.equal(schemaBlock, migrationSql);
});
