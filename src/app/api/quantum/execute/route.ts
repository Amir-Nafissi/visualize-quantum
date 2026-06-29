import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Bridge from the UI to the Qiskit backend.
 *
 *  - Local dev (`next dev` / `next start`): spawns the project's Python venv to
 *    run `python/execute.py` in CLI mode (stdin -> stdout). This is why
 *    "Run QAOA" works without `vercel dev`.
 *  - Production: if `QUANTUM_API_URL` is set, the request is proxied there (e.g.
 *    a separately deployed Python service or the Vercel Python function). The
 *    Node serverless runtime can't run Qiskit itself, so a Python target is
 *    required for hosted execution.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Locate a Python interpreter: explicit override, project venv, then PATH. */
function resolvePython(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const root = process.cwd();
  const candidates = [
    path.join(root, ".venv", "Scripts", "python.exe"), // Windows
    path.join(root, ".venv", "bin", "python"), // macOS / Linux
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return process.platform === "win32" ? "python" : "python3";
}

interface PythonEnvelope {
  status: number;
  body: unknown;
}

function runPython(body: string): Promise<PythonEnvelope> {
  const python = resolvePython();
  const script = path.join(process.cwd(), "python", "execute.py");

  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) =>
      reject(
        new Error(
          `Could not start Python ("${python}"): ${err.message}. ` +
            `Create a venv and install requirements (see README), or set PYTHON_BIN.`
        )
      )
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `Python exited with code ${code}.`)
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as PythonEnvelope);
      } catch {
        reject(
          new Error(
            `Unexpected Python output: ${stdout.slice(0, 300) || "(empty)"}`
          )
        );
      }
    });

    child.stdin.write(body);
    child.stdin.end();
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();

  // Production / hosted: proxy to a Python service if configured.
  const proxyUrl = process.env.QUANTUM_API_URL;
  if (proxyUrl) {
    try {
      const upstream = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await upstream.json();
      return NextResponse.json(data, { status: upstream.status });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach quantum service.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Local: run the bundled Python backend directly.
  try {
    const { status, body: result } = await runPython(body);
    return NextResponse.json(result, { status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Quantum execution failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", service: "qaoa-graph-coloring" });
}
