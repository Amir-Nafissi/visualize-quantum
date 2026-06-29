"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Cpu, Loader2, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { conflictingEdges } from "./lib";
import { useGraphColoringStore, type QaoaResult } from "./store";

const TOKEN_KEY = "vq_ibm_token";
const QUBIT_CAP = 18; // local statevector sim limit (nodes * colors)

export function ConfigPanel() {
  const {
    graph,
    colors,
    p,
    target,
    ibmToken,
    saveToken,
    status,
    runPhase,
    setColors,
    setP,
    setTarget,
    setIbmToken,
    setSaveToken,
    setStatus,
    setRunPhase,
    setResult,
    setError,
  } = useGraphColoringStore();

  // Hydrate a previously saved IBM token from localStorage.
  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) {
      setIbmToken(saved);
      setSaveToken(true);
    }
  }, [setIbmToken, setSaveToken]);

  const qubits = graph.nodes.length * colors;
  // Busy while the request is in flight *or* the run animation is playing.
  const running =
    status === "running" ||
    runPhase === "superposition" ||
    runPhase === "settling";

  async function handleRun() {
    if (graph.nodes.length < 2) {
      toast.error("Add at least 2 nodes before running.");
      return;
    }
    if (qubits > QUBIT_CAP) {
      toast.error(
        `Too large for the local simulator: ${graph.nodes.length} nodes × ${colors} colors = ${qubits} qubits (max ${QUBIT_CAP}).`
      );
      return;
    }

    // Persist or clear the token according to the checkbox.
    if (target === "ibm" && saveToken && ibmToken) {
      window.localStorage.setItem(TOKEN_KEY, ibmToken);
    } else if (!saveToken) {
      window.localStorage.removeItem(TOKEN_KEY);
    }

    setStatus("running");
    setRunPhase("superposition"); // start the cinematic animation immediately
    setResult(null);
    setError(null);
    const toastId = toast.loading(
      target === "ibm"
        ? "Submitting QAOA job to IBM Quantum…"
        : "Running QAOA on the local simulator…"
    );

    try {
      const res = await fetch("/api/quantum/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph: { nodes: graph.nodes, edges: graph.edges },
          colors,
          p,
          target,
          ibm_token: target === "ibm" ? ibmToken : "",
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
          (detail as { error?: string }).error ??
            `Execution failed (HTTP ${res.status}).`
        );
      }

      const data = (await res.json()) as QaoaResult;
      setResult(data);
      setStatus("done");
      // Hand off to the energy-driven settle animation; charts reveal when it
      // finishes (GraphBuilder -> setRunPhase("revealed")).
      setRunPhase("settling");

      const conflicts = conflictingEdges(graph.edges, data.coloring);
      if (data.fallback) {
        toast.warning("IBM run unavailable — fell back to local simulator.", {
          id: toastId,
        });
      } else if (conflicts.length === 0) {
        toast.success(`Proper coloring found on ${backendLabel(data)}.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `QAOA finished, but ${conflicts.length} edge(s) still conflict (shown in red).`,
          { id: toastId }
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during execution.";
      setError(message);
      setStatus("error");
      setRunPhase("idle");
      toast.error(message, { id: toastId });
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {/* Number of colors */}
        <div className="space-y-2">
          <Label>Number of colors</Label>
          <Select
            value={String(colors)}
            onValueChange={(v) => setColors(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 3, 4].map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {c} colors
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* QAOA depth p */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>QAOA depth p</Label>
            <span className="font-mono text-sm text-muted-foreground">{p}</span>
          </div>
          <Slider
            value={[p]}
            min={1}
            max={5}
            step={1}
            onValueChange={([v]) => setP(v)}
            className="pt-2"
          />
        </div>
      </div>

      {/* Execution target toggle */}
      <div className="space-y-2">
        <Label>Execution target</Label>
        <div className="grid grid-cols-2 gap-2">
          <TargetButton
            active={target === "local"}
            onClick={() => setTarget("local")}
            icon={<Cpu className="size-4" />}
            label="Local Simulator"
          />
          <TargetButton
            active={target === "ibm"}
            onClick={() => setTarget("ibm")}
            icon={<Radio className="size-4" />}
            label="IBM Quantum"
          />
        </div>
      </div>

      {/* IBM token (only when IBM is selected) */}
      {target === "ibm" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3 overflow-hidden"
        >
          <div className="space-y-2">
            <Label htmlFor="ibm-token">IBM Quantum API token</Label>
            <Input
              id="ibm-token"
              type="password"
              placeholder="Paste your IBM Quantum token"
              value={ibmToken}
              onChange={(e) => setIbmToken(e.target.value)}
              autoComplete="off"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={saveToken}
              onChange={(e) => setSaveToken(e.target.checked)}
              className="size-4 rounded border-border bg-secondary accent-primary"
            />
            Save token to LocalStorage
          </label>
          <p className="text-xs text-muted-foreground/70">
            Invalid or missing tokens fall back to the local simulator
            automatically.
          </p>
        </motion.div>
      )}

      {/* Qubit budget hint */}
      <div
        className={cn(
          "rounded-lg border px-3 py-2 text-xs",
          qubits > QUBIT_CAP
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border bg-secondary/40 text-muted-foreground"
        )}
      >
        Circuit size: {graph.nodes.length} nodes × {colors} colors ={" "}
        <span className="font-mono">{qubits}</span> qubits
        {qubits > QUBIT_CAP && ` — exceeds local cap of ${QUBIT_CAP}`}
      </div>

      <Button
        onClick={handleRun}
        disabled={running}
        size="lg"
        className="w-full gap-2"
      >
        {running ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="size-4" />
            Run QAOA
          </>
        )}
      </Button>
    </div>
  );
}

function TargetButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function backendLabel(result: QaoaResult): string {
  return result.backend ?? "local simulator";
}
