import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, unlink } from "node:fs/promises";
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
  const testJar = resolve(frontendDirectory, ".local", `${name}.jar`);
  const turnName = `${name}-turn`;
  const turnSecret = randomBytes(24).toString("base64url");
  let turnStarted = false;
  let frontend: ReturnType<typeof spawn> | undefined;
  let containerStarted = false;
  let backend: ReturnType<typeof spawn> | undefined;
  let backendOutput = "";

  async function cleanup() {
    for (const child of [frontend, backend]) {
      if (child && child.exitCode === null) {
        const stopped = new Promise<void>((resolveStop) =>
          child.once("exit", () => resolveStop()),
        );
        if (process.platform === "win32" && child.pid) {
          // Java launcher shims may spawn another JVM; terminate only our spawned tree.
          await exec("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            windowsHide: true,
          }).catch(() => undefined);
        } else child.kill();
        await Promise.race([
          stopped,
          new Promise((resolveStop) => setTimeout(resolveStop, 5_000)),
        ]);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    }
    if (turnStarted) {
      await exec(docker, ["rm", "--force", "--volumes", turnName], {
        windowsHide: true,
      }).catch(() => undefined);
    }
    if (containerStarted) {
      // The unique name belongs only to this run; no project volumes or user
      // containers are touched, and this container has no mounted storage.
      await exec(docker, ["rm", "--force", "--volumes", name], {
        windowsHide: true,
      }).catch(() => undefined);
    }
    await unlink(testJar).catch(() => undefined);
  }

  try {
    await mkdir(dirname(testJar), { recursive: true });
    // Windows locks running JARs; keep Maven's build output available for rebuilds.
    await copyFile(resolve(target, jars[0]), testJar);
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

    // Local-only relay fixture; allowing loopback peers is restricted to this test container.
    await exec(
      docker,
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        turnName,
        "--label",
        "com.nexora.purpose=browser-tests",
        "--publish",
        "127.0.0.1::3478/udp",
        "--publish",
        "127.0.0.1:49400-49420:49400-49420/udp",
        "coturn/coturn:4.18.0-r0",
        "-n",
        "--log-file=stdout",
        "--no-cli",
        "--realm=nexory-test",
        "--use-auth-secret",
        `--static-auth-secret=${turnSecret}`,
        "--external-ip=127.0.0.1",
        "--min-port=49400",
        "--max-port=49420",
        "--allow-loopback-peers",
        "--no-multicast-peers",
        "--no-tcp-relay",
      ],
      { windowsHide: true, timeout: 120_000 },
    );
    turnStarted = true;
    const turnPort = (
      await exec(docker, ["port", turnName, "3478/udp"], { windowsHide: true })
    ).stdout
      .trim()
      .split(":")
      .at(-1);
    if (!turnPort || !/^\d+$/.test(turnPort))
      throw new Error("Docker did not report the test TURN port.");

    backend = spawn(java, ["-jar", testJar], {
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
        TURN_URLS: `turn:127.0.0.1:${turnPort}?transport=udp`,
        TURN_SHARED_SECRET: turnSecret,
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
    // Start Vite after the API so HTTP and native WebSocket share the real proxy.
    frontend = spawn(
      process.execPath,
      [
        resolve(frontendDirectory, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5178",
        "--strictPort",
      ],
      {
        cwd: frontendDirectory,
        windowsHide: true,
        env: {
          ...process.env,
          BACKEND_URL: backendUrl,
          VITE_API_BASE_URL: "/api",
        },
        stdio: "ignore",
      },
    );
    let frontendError: Error | undefined;
    frontend.on("error", (error) => {
      frontendError = error;
    });
    await waitFor(async () => {
      if (frontendError) throw frontendError;
      if (frontend?.exitCode !== null)
        throw new Error(
          "Test Vite server exited; check that port 5178 is free.",
        );
      try {
        return (
          await fetch("http://127.0.0.1:5178", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok;
      } catch {
        return false;
      }
    }, "isolated frontend proxy");
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
