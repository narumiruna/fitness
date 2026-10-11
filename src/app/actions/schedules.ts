"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { addCalendarDays } from "@/lib/training";
import { scheduleSchema } from "@/lib/validation";
export async function saveScheduleAction(data: FormData) {
  const user = await requireUser();
  const input = scheduleSchema.parse({
    ...Object.fromEntries(data),
    templateId: data.get("templateId") === "none" ? "" : data.get("templateId"),
  });
  const effectiveFrom = parseDateKey(
    addCalendarDays(formatDateKey(new Date()), 1),
  ) as Date;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });
    const template = input.templateId
      ? await tx.workoutTemplate.findFirst({
          where: { id: input.templateId, userId: user.id },
        })
      : null;
    if (input.templateId && !template) throw new Error("Template not found.");
    // Remove only not-yet-effective revisions; close the current historical interval.
    await tx.templateSchedule.deleteMany({
      where: {
        userId: user.id,
        weekday: input.weekday,
        effectiveFrom: { gte: effectiveFrom },
      },
    });
    await tx.templateSchedule.updateMany({
      where: {
        userId: user.id,
        weekday: input.weekday,
        effectiveFrom: { lt: effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      data: { effectiveTo: effectiveFrom },
    });
    if (template)
      await tx.templateSchedule.create({
        data: {
          userId: user.id,
          weekday: input.weekday,
          templateId: template.id,
          title: template.title,
          effectiveFrom,
        },
      });
  });
  revalidatePath("/", "layout");
}
