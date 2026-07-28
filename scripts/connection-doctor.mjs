import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const profilePath = path.join(
  repositoryRoot,
  "ops",
  "connection-profile.json",
);
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const offline = process.argv.includes("--offline");
const results = [];

function add(level, area, message) {
  results.push({ level, area, message });
}

function commandInvocation(name, args) {
  if (process.platform === "win32" && name === "vercel") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "vercel.cmd", ...args],
    };
  }

  return { file: name, args };
}

function run(name, args) {
  try {
    const invocation = commandInvocation(name, args);
    const stdout = execFileSync(invocation.file, invocation.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { ok: false, reason: "not-installed" };
    }
    return { ok: false, reason: "command-failed" };
  }
}

function sanitizeRemote(remote) {
  try {
    const parsed = new URL(remote);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const safeScpRemote =
      /^(?:git|ssh)@[a-z0-9.-]+:[a-z0-9._/-]+(?:\.git)?$/i;
    return safeScpRemote.test(remote)
      ? remote
      : "<remote-redacted-unrecognized-format>";
  }
}

function normalizeRemote(remote) {
  return sanitizeRemote(remote).replace(/\/+$/, "").replace(/\.git$/, "");
}

function checkGit() {
  const safeDirectory = repositoryRoot.replaceAll("\\", "/");
  const remote = run("git", [
    "-c",
    `safe.directory=${safeDirectory}`,
    "remote",
    "get-url",
    "origin",
  ]);

  if (!remote.ok) {
    add("FAIL", "GitHub", "Không đọc được remote origin của Git.");
    return;
  }

  const safeRemote = sanitizeRemote(remote.stdout);
  if (normalizeRemote(safeRemote) === normalizeRemote(profile.github.remote)) {
    add("PASS", "GitHub", `Remote đúng: ${safeRemote}`);
  } else {
    add(
      "FAIL",
      "GitHub",
      `Remote hiện tại không khớp profile: ${safeRemote}`,
    );
  }

  const branch = run("git", [
    "-c",
    `safe.directory=${safeDirectory}`,
    "branch",
    "--show-current",
  ]);
  if (branch.ok && branch.stdout === profile.github.defaultBranch) {
    add("PASS", "GitHub", `Đang ở nhánh ${branch.stdout}.`);
  } else if (branch.ok && branch.stdout) {
    add(
      "WARN",
      "GitHub",
      `Đang ở nhánh ${branch.stdout}; nhánh mặc định là ${profile.github.defaultBranch}.`,
    );
  } else {
    add("WARN", "GitHub", "Không xác định được nhánh hiện tại.");
  }

  const ghVersion = run("gh", ["--version"]);
  if (!ghVersion.ok) {
    add(
      "WARN",
      "GitHub",
      "Chưa tìm thấy GitHub CLI; cài `gh` để đăng nhập lại nhanh bằng trình duyệt.",
    );
    return;
  }

  if (offline) {
    add("INFO", "GitHub", "Bỏ qua kiểm tra phiên GitHub vì dùng --offline.");
    return;
  }

  const ghAuth = run("gh", [
    "auth",
    "status",
    "--hostname",
    profile.github.host,
  ]);
  add(
    ghAuth.ok ? "PASS" : "WARN",
    "GitHub",
    ghAuth.ok
      ? "GitHub CLI đang có phiên đăng nhập."
      : "GitHub CLI cần đăng nhập lại bằng `gh auth login --web`.",
  );
}

function checkVercelLink() {
  const projectFile = path.join(repositoryRoot, ".vercel", "project.json");
  if (!existsSync(projectFile)) {
    add(
      "WARN",
      "Vercel",
      "Workspace chưa được link cục bộ; chạy lệnh `vercel link` trong runbook.",
    );
  } else {
    try {
      const localProject = JSON.parse(readFileSync(projectFile, "utf8"));
      const expectedOrgId = profile.vercel.orgId;
      const expectedProjectId = profile.vercel.projectId;
      const hasCanonicalIds =
        typeof expectedOrgId === "string" &&
        expectedOrgId.length > 0 &&
        typeof expectedProjectId === "string" &&
        expectedProjectId.length > 0;

      if (localProject.projectName !== profile.vercel.projectSlug) {
        add(
          "FAIL",
          "Vercel",
          "Workspace đang link tới một Vercel project khác.",
        );
      } else if (!hasCanonicalIds) {
        add(
          "WARN",
          "Vercel",
          "Tên project khớp nhưng profile chưa có orgId/projectId; chưa thể xác minh đúng team bằng canonical ID.",
        );
      } else if (
        localProject.orgId === expectedOrgId &&
        localProject.projectId === expectedProjectId
      ) {
        add(
          "PASS",
          "Vercel",
          `Workspace đã link đúng project ${profile.vercel.projectSlug} và team canonical.`,
        );
      } else {
        add(
          "FAIL",
          "Vercel",
          "Tên project khớp nhưng orgId/projectId không khớp profile.",
        );
      }
    } catch {
      add("FAIL", "Vercel", "Không đọc được .vercel/project.json.");
    }
  }

  const vercelVersion = run("vercel", ["--version"]);
  if (!vercelVersion.ok) {
    add(
      "WARN",
      "Vercel",
      "Chưa tìm thấy Vercel CLI; cài CLI trước khi cần link hoặc kéo env.",
    );
    return;
  }

  if (offline) {
    add("INFO", "Vercel", "Bỏ qua kiểm tra phiên Vercel vì dùng --offline.");
    return;
  }

  const whoAmI = run("vercel", ["whoami"]);
  add(
    whoAmI.ok ? "PASS" : "WARN",
    "Vercel",
    whoAmI.ok
      ? "Vercel CLI đang có phiên đăng nhập."
      : "Vercel CLI cần đăng nhập lại bằng `vercel login`.",
  );
}

async function checkProductionHealth() {
  if (offline) {
    add(
      "INFO",
      "Production",
      "Bỏ qua kiểm tra endpoint vì dùng --offline.",
    );
    return;
  }

  const healthUrl = new URL(
    profile.vercel.healthPath,
    profile.vercel.productionUrl,
  );

  try {
    const response = await fetch(healthUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      add(
        "FAIL",
        "Production",
        `Health endpoint trả HTTP ${response.status}.`,
      );
      return;
    }

    const health = await response.json();
    if (!health.ok) {
      add("FAIL", "Production", "Health endpoint không báo trạng thái ok.");
      return;
    }

    add(
      health.mode === "live" ? "PASS" : "WARN",
      "Production",
      `Ứng dụng đang ở chế độ ${health.mode ?? "không xác định"}.`,
    );

    const configured = health.configured ?? {};
    const missing = ["database", "meta", "security", "cron", "legal"].filter(
      (key) => configured[key] !== true,
    );
    if (missing.length === 0) {
      add(
        "PASS",
        "Production",
        "Database, Meta, security, cron và legal đều đã cấu hình.",
      );
    } else {
      add(
        "FAIL",
        "Production",
        `Thiếu cấu hình runtime: ${missing.join(", ")}.`,
      );
    }

    add(
      "INFO",
      "Meta",
      "Health công khai chỉ xác nhận cấu hình server; trạng thái access token phải xem trong Sức khỏe dữ liệu bằng owner session.",
    );
  } catch {
    add(
      "FAIL",
      "Production",
      `Không truy cập được ${healthUrl.toString()}.`,
    );
  }
}

function printResults() {
  const symbols = {
    PASS: "✓",
    WARN: "!",
    FAIL: "✗",
    INFO: "i",
  };

  console.log("Connection doctor — GitHub · Vercel · Meta");
  console.log(`Profile: ${path.relative(repositoryRoot, profilePath)}`);
  console.log("");
  for (const result of results) {
    console.log(
      `[${symbols[result.level]}] ${result.area}: ${result.message}`,
    );
  }

  const failures = results.filter((result) => result.level === "FAIL").length;
  const warnings = results.filter((result) => result.level === "WARN").length;
  console.log("");
  console.log(`Kết quả: ${failures} lỗi, ${warnings} cảnh báo.`);
  if (failures > 0) process.exitCode = 1;
}

checkGit();
checkVercelLink();
await checkProductionHealth();
printResults();
