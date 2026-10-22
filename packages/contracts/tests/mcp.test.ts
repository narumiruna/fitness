import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  type McpToolName,
  mcpAuthorizationSchema,
  mcpConnectionsSchema,
  mcpConsentDecisionSchema,
  mcpToolErrorSchema,
  mcpToolSchemas,
} from "../src/index.js";

test("browser OAuth contracts require a visible client identity and strict consent", () => {
  const authorization = {
    requestId: "x".repeat(43),
    clientId: "https://client.example/client.json",
    clientName: "Self-declared name",
    scopes: ["fitness:read"],
    resource: "https://fitness.example/mcp",
    expiresAt: new Date().toISOString(),
  };
  mcpAuthorizationSchema.parse(authorization);
  const { clientId: _clientId, ...withoutIdentity } = authorization;
  assert.equal(
    mcpAuthorizationSchema.safeParse(withoutIdentity).success,
    false,
  );
  assert.equal(
    mcpAuthorizationSchema.safeParse({
      ...authorization,
      token: "must-not-leak",
    }).success,
    false,
  );
  assert.equal(
    mcpConsentDecisionSchema.safeParse({ approved: true, userId: "other" })
      .success,
    false,
  );
  mcpConnectionsSchema.parse({
    connections: [
      {
        id: "grant",
        clientId: authorization.clientId,
        clientName: authorization.clientName,
        scopes: authorization.scopes,
        createdAt: authorization.expiresAt,
        expiresAt: authorization.expiresAt,
      },
    ],
  });
});

const operationId = "f9e4a7a5-ef41-40aa-9ebc-4a38ecad737a";
const range = { fromDate: "2026-01-01", toDateExclusive: "2027-01-01" };
const set = { exerciseId: "bench", weightKg: 60.5, reps: 5, type: "WORKING" };
const record = { operationId, date: "2026-01-31", sets: [set] };
const inputs = {
  fitness_get_context: {},
  fitness_search_exercises: { query: "bench", locale: "en", limit: 20 },
  fitness_list_workouts: { ...range, limit: 50 },
  fitness_get_workout: { workoutId: "w1" },
  fitness_get_training_summary: range,
  fitness_get_exercise_progress: { ...range, exerciseId: "bench" },
  fitness_record_workout: record,
} satisfies Record<McpToolName, unknown>;
const units = { weight: "kg", volume: "kg_reps" };
const inclusionRules = {
  workouts: "COMPLETED",
  sets: "completed = true",
  totalVolume: "includes WARMUP and WORKING",
  workingMetrics: "WORKING only",
  estimatedOneRepMax: "Epley: weightKg * (1 + reps / 30); estimate",
  weekStartsOn: "Sunday",
};
const metrics = {
  workoutCount: 0,
  trainingDayCount: 0,
  setCount: 0,
  workingSetCount: 0,
  reps: 0,
  totalVolumeKgReps: 0,
  workingVolumeKgReps: 0,
};
const analysis = {
  ...range,
  generatedAt: "2026-10-22T12:00:00.000Z",
  units,
  inclusionRules,
  ...metrics,
};
const outputs = {
  fitness_get_context: {
    displayName: "user",
    scopes: ["fitness:read"],
    generatedAt: analysis.generatedAt,
    units,
    dateRules: {
      format: "YYYY-MM-DD",
      rangeStart: "inclusive",
      rangeEnd: "exclusive",
      timezone: "explicit local calendar date; no user timezone stored",
      weekStartsOn: "Sunday",
    },
    limits: {
      setsPerWorkout: 200,
      workoutPageSize: 50,
      exercisePageSize: 20,
      rangeDays: 366,
      analysisSets: 50000,
    },
  },
  fitness_search_exercises: {
    exercises: [
      {
        id: "bench",
        slug: "bench-press",
        defaultName: "Bench Press",
        names: [{ locale: "en", name: "Bench Press", isPrimary: true }],
        aliases: [{ locale: "en", alias: "bench" }],
        muscles: [{ muscle: "CHEST", role: "PRIMARY" }],
        equipment: ["BARBELL"],
      },
    ],
    nextCursor: null,
  },
  fitness_list_workouts: { workouts: [], units, nextCursor: null },
  fitness_get_workout: {
    workoutId: "w1",
    date: "2026-01-31",
    title: null,
    notes: null,
    version: 0,
    units,
    sets: [
      {
        setId: "s1",
        exerciseId: "bench",
        order: 1,
        weightKg: 60.5,
        reps: 5,
        type: "WORKING",
        rir: null,
        notes: null,
      },
    ],
  },
  fitness_get_training_summary: {
    ...analysis,
    weekly: [{ weekStartDate: "2025-12-28", ...metrics }],
  },
  fitness_get_exercise_progress: {
    ...analysis,
    exerciseId: "bench",
    maxWeight: null,
    estimatedOneRepMax: null,
    workouts: [],
  },
  fitness_record_workout: {
    workoutId: "w1",
    version: 0,
    date: "2026-01-31",
    units,
    savedSetCount: 1,
    retry: false,
  },
} satisfies Record<McpToolName, unknown>;

test("seven exact tool names have strict schemas and independent scopes", () => {
  assert.deepEqual(
    Object.keys(mcpToolSchemas).sort(),
    Object.keys(inputs).sort(),
  );
  for (const name of Object.keys(inputs) as McpToolName[]) {
    const schema = mcpToolSchemas[name];
    assert.equal(
      schema.scope,
      name === "fitness_record_workout" ? "fitness:write" : "fitness:read",
    );
    assert.ok(schema.description.length > 0);
    assert.equal(
      schema.inputSchema.safeParse(inputs[name]).success,
      true,
      name,
    );
    for (const field of [
      "userId",
      "owner",
      "role",
      "where",
      "destinationUrl",
    ]) {
      assert.equal(
        schema.inputSchema.safeParse({ ...inputs[name], [field]: "other" })
          .success,
        false,
        `${name}: ${field}`,
      );
    }
    assert.deepEqual(schema.outputSchema.parse(outputs[name]), outputs[name]);
    assert.equal(
      schema.outputSchema.safeParse({ ...outputs[name], token: "secret" })
        .success,
      false,
    );
    assert.equal(z.toJSONSchema(schema.inputSchema).type, "object");
    assert.equal(z.toJSONSchema(schema.outputSchema).type, "object");
  }
});

test("dates are explicit valid local calendar dates and ranges are at most 366 days", () => {
  const schema = mcpToolSchemas.fitness_get_training_summary.inputSchema;
  assert.equal(
    schema.safeParse({ fromDate: "2024-01-01", toDateExclusive: "2025-01-01" })
      .success,
    true,
  );
  for (const invalid of [
    { fromDate: "2024-01-01", toDateExclusive: "2025-01-02" },
    { fromDate: "2026-02-30", toDateExclusive: "2026-03-02" },
    { fromDate: "2026-01-01", toDateExclusive: "2026-01-01" },
    { fromDate: "2026-02-01", toDateExclusive: "2026-01-01" },
    { fromDate: "2026-01-01T00:00:00Z", toDateExclusive: "2026-02-01" },
  ])
    assert.equal(schema.safeParse(invalid).success, false);
  for (const date of [
    "today",
    "2026-02-29",
    "2026-01-31T16:00:00Z",
    "1899-12-31",
  ]) {
    assert.equal(
      mcpToolSchemas.fitness_record_workout.inputSchema.safeParse({
        ...record,
        date,
      }).success,
      false,
    );
  }
  assert.equal(
    mcpToolSchemas.fitness_record_workout.inputSchema.safeParse({
      ...record,
      date: "2024-02-29",
    }).success,
    true,
  );
});

test("performed sets require typed finite kg, integral reps, explicit type, and optional half-step RIR", () => {
  const schema = mcpToolSchemas.fitness_record_workout.inputSchema;
  for (const field of ["exerciseId", "weightKg", "reps", "type"]) {
    const invalid = { ...set } as Record<string, unknown>;
    delete invalid[field];
    assert.equal(
      schema.safeParse({ ...record, sets: [invalid] }).success,
      false,
    );
  }
  for (const invalid of [
    { weightKg: "60" },
    { weightKg: null },
    { weightKg: -1 },
    { weightKg: 2000.1 },
    { weightKg: NaN },
    { weightKg: Infinity },
    { reps: 0 },
    { reps: 1.5 },
    { reps: 1001 },
    { reps: "5" },
    { type: "TARGET" },
    { rir: -0.5 },
    { rir: 10.5 },
    { rir: 1.1 },
    { rir: "0" },
    { rir: "" },
    { order: 2 },
    { weight: 60 },
    { notes: "x".repeat(1001) },
  ])
    assert.equal(
      schema.safeParse({ ...record, sets: [{ ...set, ...invalid }] }).success,
      false,
      JSON.stringify(invalid),
    );
  for (const weightKg of [0, 2000]) {
    for (const rir of [undefined, null, 0, 0.5, 10]) {
      const parsed = schema.parse({
        ...record,
        sets: [{ ...set, weightKg, reps: 1000, rir }],
      });
      assert.equal(parsed.sets[0].rir, rir);
    }
  }
  assert.equal(schema.parse(record).sets[0].rir, undefined);
  assert.equal(
    schema.safeParse({ ...record, operationId: "retry-1" }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ ...record, title: "x".repeat(121) }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ ...record, notes: "x".repeat(2001) }).success,
    false,
  );
  assert.equal(schema.safeParse({ ...record, sets: [] }).success, false);
  assert.equal(
    schema.safeParse({ ...record, sets: Array(200).fill(set) }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ ...record, sets: Array(201).fill(set) }).success,
    false,
  );
});

test("search and list pages have bounded numeric limits without coercion", () => {
  for (const [name, max] of [
    ["fitness_search_exercises", 20],
    ["fitness_list_workouts", 50],
  ] as const) {
    const schema = mcpToolSchemas[name].inputSchema;
    for (const limit of [0, max + 1, 1.5, "1", null]) {
      assert.equal(schema.safeParse({ ...inputs[name], limit }).success, false);
    }
    for (const cursor of ["", "x".repeat(2049), 1]) {
      assert.equal(
        schema.safeParse({ ...inputs[name], cursor }).success,
        false,
      );
    }
  }
  const schema = mcpToolSchemas.fitness_search_exercises.inputSchema;
  assert.equal(schema.safeParse({ query: "", locale: "zh-TW" }).success, true);
  assert.equal(
    schema.safeParse({ query: "x".repeat(121), locale: "en" }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ query: "bench", locale: "zh-CN" }).success,
    false,
  );
});

test("outputs enforce unit labels, ISO generation instants, private catalog projection, and stable errors", () => {
  const summary = mcpToolSchemas.fitness_get_training_summary.outputSchema;
  for (const invalid of [
    { units: { weight: "lb", volume: "kg_reps" } },
    { generatedAt: "2026-10-22" },
    { totalVolumeKgReps: Infinity },
    {
      inclusionRules: {
        ...inclusionRules,
        workingMetrics: "includes warm-ups",
      },
    },
  ])
    assert.equal(
      summary.safeParse({ ...outputs.fitness_get_training_summary, ...invalid })
        .success,
      false,
    );
  const catalog = outputs.fitness_search_exercises;
  assert.equal(
    mcpToolSchemas.fitness_search_exercises.outputSchema.safeParse({
      ...catalog,
      exercises: [{ ...catalog.exercises[0], createdByUserId: "other" }],
    }).success,
    false,
  );
  const source = {
    setId: "s",
    workoutId: "w",
    date: "2026-01-31",
    weightKg: 60,
    reps: 5,
    value: 70,
  };
  assert.equal(
    mcpToolSchemas.fitness_get_exercise_progress.outputSchema.safeParse({
      ...outputs.fitness_get_exercise_progress,
      estimatedOneRepMax: source,
    }).success,
    true,
  );
  const { setId: _, ...missingSource } = source;
  assert.equal(
    mcpToolSchemas.fitness_get_exercise_progress.outputSchema.safeParse({
      ...outputs.fitness_get_exercise_progress,
      estimatedOneRepMax: missingSource,
    }).success,
    false,
  );
  for (const code of [
    "INVALID_INPUT",
    "INSUFFICIENT_SCOPE",
    "NOT_FOUND",
    "INVALID_CURSOR",
    "RANGE_TOO_LARGE",
    "IDEMPOTENCY_CONFLICT",
    "RESULT_REMOVED",
  ]) {
    assert.deepEqual(mcpToolErrorSchema.parse({ code }), { code });
  }
  assert.equal(
    mcpToolErrorSchema.safeParse({ code: "DATABASE_ERROR", message: "private" })
      .success,
    false,
  );
});
