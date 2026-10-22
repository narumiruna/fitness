import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Bounded JSON-lines machine interface. Never sends a user/model turn. */
export class HostProcess {
  pending = new Map();
  nextId = 0;
  constructor(command, args, kind, env = process.env) {
    this.kind = kind;
    this.child = spawn(command, args, {
      cwd: process.env.FITNESS_MCP_CLIENTS_DIR,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.resume(); // Do not publish host logs, auth URLs, or tokens.
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      const id = kind === "claude" ? value.response?.request_id : value.id;
      const pending = this.pending.get(String(id));
      if (pending) {
        this.pending.delete(String(id));
        clearTimeout(pending.timer);
        const error =
          kind === "claude" ? value.response?.subtype === "error" : value.error;
        if (error)
          pending.reject(new Error(`Host request rejected: ${pending.method}`));
        else
          pending.resolve(
            kind === "claude" ? value.response.response : value.result,
          );
      } else if (kind === "claude" && value.type === "control_request") {
        // No tool permission bypass. These workflows do not run an agent turn.
        this.send({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: value.request_id,
            response: {
              behavior: "deny",
              message: "No agent tools authorized by this fixture",
            },
          },
        });
      }
    });
    this.child.on("error", () => this.fail());
    this.child.on("exit", () => this.fail());
  }
  fail() {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(`Host exited during ${item.method}`));
    }
    this.pending.clear();
  }
  send(value) {
    this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }
  request(method, params = {}) {
    const allowed =
      this.kind === "claude"
        ? [
            "initialize",
            "mcp_clear_auth",
            "mcp_set_servers",
            "mcp_authenticate",
            "mcp_status",
            "mcp_call",
          ]
        : [
            "initialize",
            "thread/start",
            "mcpServer/oauth/login",
            "config/mcpServer/reload",
            "mcpServerStatus/list",
            "mcpServer/tool/call",
          ];
    if (!allowed.includes(method))
      throw new Error("Only no-model MCP machine methods are permitted");
    const id = String(++this.nextId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Host request timeout: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.send(
        this.kind === "claude"
          ? {
              type: "control_request",
              request_id: id,
              request: { subtype: method, ...params },
            }
          : { jsonrpc: "2.0", id, method, params },
      );
    });
  }
  async close() {
    this.lines.close();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const exited = new Promise((resolve) => this.child.once("exit", resolve));
      this.child.kill("SIGTERM");
      const timer = setTimeout(() => this.child.kill("SIGKILL"), 1500);
      await exited;
      clearTimeout(timer);
    }
    this.fail();
  }
}
