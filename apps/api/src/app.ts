import {
  actionEnvelopeSchema,
  authenticatePasskeyRequestSchema,
  bootstrapSchema,
  formFieldsSchema,
  importConfirmationSchema,
  importPreviewSchema,
  passkeyRegistrationOptionsRequestSchema,
  registerPasskeyRequestSchema,
  viewSchemas,
} from "@narumitw/fitness-contracts";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import { z } from "zod";
import {
  authenticatePasskey,
  formActions,
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  registerPasskey,
  setLocaleAction,
} from "./action-registry.js";
import { toDto, validateDto } from "./dto.js";
import { ActionRedirect, ApiError } from "./errors.js";
import { getCurrentUser, hasUsers, requireUser } from "./lib/auth.js";
import { exportWorkouts } from "./lib/data-transfer.js";
import { getLocale } from "./lib/i18n.js";
import { getLogger } from "./lib/logger.js";
import { csvLimit, serializeWorkouts } from "./lib/workout-csv.js";
import { requestLogging } from "./middleware/request-logging.js";
import { withRequest } from "./request-context.js";
import { readView } from "./views.js";

async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
async function parseActionBody(request: Request, action: string) {
  const multipart =
    action === "previewImportAction" || action === "confirmImportAction";
  const media = request.headers.get("content-type")?.split(";")[0].trim();
  if (media !== (multipart ? "multipart/form-data" : "application/json"))
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE");
  const body = await boundedBody(
    request,
    multipart
      ? csvLimit + (action === "confirmImportAction" ? csvLimit : 0) + 65536
      : 1024 * 1024,
  );
  try {
    if (multipart)
      return await new Response(body, {
        headers: {
          "content-type": request.headers.get("content-type") as string,
        },
      }).formData();
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
}
export type AppOptions = { trustedOrigin?: string };
export function createApp(options: AppOptions = {}) {
  const app = new Hono();
  app.use("*", requestLogging);
  app.use("*", async (c, next) =>
    withRequest(c, async () => {
      c.header("cache-control", "private, no-store");
      await next();
    }),
  );
  app.use("*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      const trusted =
        options.trustedOrigin ??
        (process.env.NODE_ENV === "production"
          ? process.env.PASSKEY_ORIGIN
          : undefined);
      let valid = Boolean(origin && trusted && origin === trusted);
      if (!trusted && process.env.NODE_ENV !== "production")
        valid =
          origin === "http://localhost:8784" ||
          origin === "http://127.0.0.1:8784";
      if (!valid || c.req.header("sec-fetch-site") === "cross-site")
        throw new ApiError(403, "FORBIDDEN");
    }
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof ActionRedirect)
      return c.json(actionEnvelopeSchema.parse({ redirect: err.destination }));
    let status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500 | 503 = 500;
    let code = "INTERNAL_ERROR";
    if (err instanceof ApiError) {
      status = err.status;
      code = err.code;
    } else if (err instanceof z.ZodError) {
      status = 400;
      code = "VALIDATION_ERROR";
    } else if ("code" in err && ["P2002", "P2034"].includes(String(err.code))) {
      status = 409;
      code = "CONFLICT";
    } else if ("code" in err && err.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
    }
    getLogger().error(
      { event: "request.failure", err, status },
      "Request failed",
    );
    return c.json(
      { error: { code, requestId: c.res.headers.get("x-request-id") ?? "" } },
      status,
    );
  });
  app.get("/api/bootstrap", async (c) =>
    c.json(
      validateDto(bootstrapSchema, {
        user: await getCurrentUser(),
        hasUsers: await hasUsers(),
        locale: await getLocale(),
      }),
    ),
  );
  app.get("/api/views/workouts/new", async (c) =>
    c.json(validateDto(viewSchemas.new, await readView("new", c.req.query()))),
  );
  app.get("/api/views/workouts/:id", async (c) =>
    c.json(
      validateDto(
        viewSchemas.workout,
        await readView("workout", c.req.query(), c.req.param("id")),
      ),
    ),
  );
  app.get("/api/views/exercises/:id", async (c) =>
    c.json(
      validateDto(
        viewSchemas.exercise,
        await readView("exercise", c.req.query(), c.req.param("id")),
      ),
    ),
  );
  for (const name of Object.keys(viewSchemas) as (keyof typeof viewSchemas)[])
    app.get(`/api/views/${name}`, async (c) =>
      c.json(
        validateDto(viewSchemas[name], await readView(name, c.req.query())),
      ),
    );
  app.post("/api/actions/:action", async (c) => {
    const action = c.req.param("action");
    if (
      !Object.hasOwn(formActions, action) &&
      ![
        "setLocaleAction",
        "passkeyRegistrationOptions",
        "registerPasskey",
        "passkeyAuthenticationOptions",
        "authenticatePasskey",
      ].includes(action)
    )
      throw new ApiError(404, "NOT_FOUND");
    const input: unknown = await parseActionBody(c.req.raw, action);
    let result: unknown;
    if (action === "setLocaleAction")
      result = await setLocaleAction(
        z.object({ locale: z.string() }).parse(input).locale,
      );
    else if (action === "passkeyRegistrationOptions") {
      const data = passkeyRegistrationOptionsRequestSchema.parse(input);
      result = await passkeyRegistrationOptions(data.password, data.name);
    } else if (action === "registerPasskey") {
      const data = registerPasskeyRequestSchema.parse(input);
      result = await registerPasskey(
        data.response as RegistrationResponseJSON,
        data.name,
      );
    } else if (action === "passkeyAuthenticationOptions") {
      z.object({}).strict().parse(input);
      result = await passkeyAuthenticationOptions();
    } else if (action === "authenticatePasskey") {
      const data = authenticatePasskeyRequestSchema.parse(input);
      result = await authenticatePasskey(
        data.response as AuthenticationResponseJSON,
      );
    } else {
      let data: FormData;
      if (input instanceof FormData) data = input;
      else {
        const fields = formFieldsSchema.parse(input);
        data = new FormData();
        for (const [key, value] of Object.entries(fields))
          for (const text of Array.isArray(value) ? value : [value])
            data.append(key, text);
      }
      result = await formActions[action as keyof typeof formActions](data);
    }
    if (action === "previewImportAction")
      result = validateDto(importPreviewSchema, result);
    if (action === "confirmImportAction")
      result = validateDto(importConfirmationSchema, result);
    return c.json(
      actionEnvelopeSchema.parse(
        result === undefined ? {} : { result: toDto(result) },
      ),
    );
  });
  const download = async () => {
    const user = await requireUser();
    return new Response(serializeWorkouts(await exportWorkouts(user.id)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=fitness-workouts-v1.csv",
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  };
  app.get("/data/export", download);
  app.get("/api/data/export", download);
  app.all("/api/*", (c) => {
    const pathname = c.req.path;
    const action = pathname.startsWith("/api/actions/")
      ? pathname.slice("/api/actions/".length)
      : "";
    const known =
      pathname === "/api/bootstrap" ||
      pathname === "/api/data/export" ||
      Object.keys(viewSchemas).some(
        (name) => pathname === `/api/views/${name}`,
      ) ||
      /^\/api\/views\/(workouts|exercises)\/[^/]+$/.test(pathname) ||
      Object.hasOwn(formActions, action) ||
      [
        "setLocaleAction",
        "passkeyRegistrationOptions",
        "registerPasskey",
        "passkeyAuthenticationOptions",
        "authenticatePasskey",
      ].includes(action);
    return c.json(
      {
        error: {
          code: known ? "METHOD_NOT_ALLOWED" : "NOT_FOUND",
          requestId: c.res.headers.get("x-request-id") ?? "",
        },
      },
      known ? 405 : 404,
    );
  });
  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "NOT_FOUND",
          requestId: c.res.headers.get("x-request-id") ?? "",
        },
      },
      404,
    ),
  );
  return app;
}
