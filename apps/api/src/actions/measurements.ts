import { parseDateKey } from "@narumitw/fitness-core/calendar";
import { ApiError } from "../errors.js";
import { requireUser } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { goalSchema, measurementSchema } from "../lib/validation.js";
export async function saveMeasurementAction(data: FormData) {
  const user = await requireUser();
  const input = measurementSchema.parse(Object.fromEntries(data));
  const date = parseDateKey(input.date);
  if (!date) throw new ApiError(400, "VALIDATION_ERROR");
  await prisma.bodyMeasurement.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, weight: input.weight, waist: input.waist },
    update: { weight: input.weight, waist: input.waist },
  });
}
export async function deleteMeasurementAction(data: FormData) {
  const user = await requireUser();
  await prisma.bodyMeasurement.deleteMany({
    where: { userId: user.id, id: String(data.get("id") ?? "") },
  });
}
export async function saveGoalAction(data: FormData) {
  const user = await requireUser();
  const weight = goalSchema.parse(data.get("weight"));
  await prisma.bodyGoal.upsert({
    where: { userId: user.id },
    create: { userId: user.id, weight },
    update: { weight },
  });
}
