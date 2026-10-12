import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const frontendDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Cannot allocate test port."));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function waitFor(
  check: () => Promise<boolean>,
  description: string,
  timeout = 60_000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

export default async function globalSetup() {
  const backendDirectory =
    process.env.NEXORA_BACKEND_DIR ||
    resolve(frontendDirectory, "..", "..", "Nexora_Backend");
  const target = resolve(backendDirectory, "target");
  const jars = existsSync(target)
    ? readdirSync(target).filter((name) =>
        /^nexora-backend-.*\.jar$/.test(name),
      )
    : [];
  if (jars.length !== 1)
    throw new Error(
      "Build the sibling Nexora_Backend project first with run.cmd package, or set NEXORA_BACKEND_DIR. Tests never connect to your normal database.",
    );

  const docker = process.env.NEXORA_DOCKER_BINARY || "docker";
  const java = process.env.JAVA_HOME
    ? resolve(
        process.env.JAVA_HOME,
        "bin",
        process.platform === "win32" ? "java.exe" : "java",
      )
    : "java";
  const name = `nexora-browser-${process.pid}-${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const backendPort = await freePort();
  let containerStarted = false;
  let backend: ReturnType<typeof spawn> | undefined;
  let backendOutput = "";

  async function cleanup() {
    if (backend && backend.exitCode === null) {
      const stopped = new Promise<void>((resolveStop) =>
        backend!.once("exit", () => resolveStop()),
      );
      backend.kill();
      await Promise.race([
        stopped,
        new Promise((resolveStop) => setTimeout(resolveStop, 5_000)),
      ]);
      if (backend.exitCode === null) backend.kill("SIGKILL");
    }
    if (containerStarted) {
      // The unique name belongs only to this run; no project volumes or user
      // containers are touched, and this container has no mounted storage.
      await exec(docker, ["rm", "--force", "--volumes", name], {
        windowsHide: true,
      }).catch(() => undefined);
    }
  }

  try {
    await exec(docker, ["version", "--format", "{{.Server.Version}}"], {
      windowsHide: true,
      timeout: 20_000,
    });
    await exec(
      docker,
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--label",
        "com.nexora.purpose=browser-tests",
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_DB=nexora_browser_test",
        "postgres:16-alpine",
      ],
      {
        env: { ...process.env, POSTGRES_PASSWORD: password },
        windowsHide: true,
        timeout: 120_000,
      },
    );
    containerStarted = true;
    const portResult = await exec(docker, ["port", name, "5432/tcp"], {
      windowsHide: true,
    });
    const databasePort = portResult.stdout.trim().split(":").at(-1);
    if (!databasePort || !/^\d+$/.test(databasePort))
      throw new Error("Docker did not report the isolated PostgreSQL port.");
    await waitFor(async () => {
      try {
        await exec(
          docker,
          [
            "exec",
            name,
            "pg_isready",
            "-U",
            "postgres",
            "-d",
            "nexora_browser_test",
          ],
          { windowsHide: true },
        );
        return true;
      } catch {
        return false;
      }
    }, "isolated PostgreSQL");

    backend = spawn(java, ["-jar", resolve(target, jars[0])], {
      cwd: backendDirectory,
      windowsHide: true,
      env: {
        ...process.env,
        DB_HOST: "127.0.0.1",
        DB_PORT: databasePort,
        DB_NAME: "nexora_browser_test",
        DB_USERNAME: "postgres",
        DB_PASSWORD: password,
        SERVER_ADDRESS: "127.0.0.1",
        SERVER_PORT: String(backendPort),
        CORS_ORIGINS: "http://127.0.0.1:5178,http://localhost:5178",
        // Override inherited Spring settings so an outside environment cannot
        // redirect migrations to the user's normal server.
        SPRING_DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${databasePort}/nexora_browser_test`,
        SPRING_DATASOURCE_USERNAME: "postgres",
        SPRING_DATASOURCE_PASSWORD: password,
        SPRING_FLYWAY_URL: `jdbc:postgresql://127.0.0.1:${databasePort}/nexora_browser_test`,
        SPRING_FLYWAY_USER: "postgres",
        SPRING_FLYWAY_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backend.on("error", (error) => {
      backendOutput += error.message;
    });
    backend.stdout?.on("data", (chunk) => {
      backendOutput = (backendOutput + String(chunk)).slice(-12_000);
    });
    backend.stderr?.on("data", (chunk) => {
      backendOutput = (backendOutput + String(chunk)).slice(-12_000);
    });
    const backendUrl = `http://127.0.0.1:${backendPort}`;
    await waitFor(async () => {
      if (backend?.exitCode !== null)
        throw new Error(
          `Isolated backend exited before startup:\n${backendOutput}`,
        );
      try {
        const result = await fetch(`${backendUrl}/actuator/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        return (
          result.ok &&
          ((await result.json()) as { status?: string }).status === "UP"
        );
      } catch {
        return false;
      }
    }, "isolated Spring Boot backend");
    process.env.NEXORA_E2E_API_URL = backendUrl;
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
