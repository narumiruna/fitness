import { requireUser } from "@/lib/auth";
import { exportWorkouts } from "@/lib/data-transfer";
import { serializeWorkouts } from "@/lib/workout-csv";
export async function GET() {
  const user = await requireUser();
  const csv = serializeWorkouts(await exportWorkouts(user.id));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=fitness-workouts-v1.csv",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
