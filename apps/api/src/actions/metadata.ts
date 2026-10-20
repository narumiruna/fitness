import { ApiError } from "../errors.js";
import { requireUser } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { metadataSchema } from "../lib/validation.js";

export async function saveMetadataAction(data: FormData) {
  const user = await requireUser();
  const {
    exerciseId: id,
    primary,
    secondary,
    equipment: tools,
  } = metadataSchema.parse({
    exerciseId: data.get("exerciseId"),
    primary: data.getAll("primary"),
    secondary: data.getAll("secondary"),
    equipment: data.getAll("equipment"),
  });
  await prisma.$transaction(async (tx) => {
    const e = await tx.exercise.findFirst({
      where: {
        id,
        ...(user.role === "ADMIN" ? {} : { createdByUserId: user.id }),
      },
    });
    if (!e) throw new ApiError(403, "FORBIDDEN");
    await tx.exerciseMuscle.deleteMany({ where: { exerciseId: id } });
    await tx.exerciseEquipment.deleteMany({ where: { exerciseId: id } });
    for (const [role, values] of [
      ["PRIMARY", primary],
      ["SECONDARY", secondary],
    ] as const)
      for (const muscle of values)
        await tx.exerciseMuscle.create({
          data: { exerciseId: id, muscle, role },
        });
    for (const tool of tools)
      await tx.exerciseEquipment.create({
        data: { exerciseId: id, equipment: tool },
      });
  });
}
