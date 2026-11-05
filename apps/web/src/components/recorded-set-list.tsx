import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import { reorderWorkoutSetsAction } from "@/api/actions";
import { queryClient } from "@/api/client";
import type { PageView } from "@/api/views";
import { useDictionary } from "@/lib/i18n";
import { RecordedSet } from "./recorded-set";

export function RecordedSetList({
  workout,
  exercises,
}: {
  workout: PageView<"workout">["workout"];
  exercises: PageView<"workout">["exercises"];
}) {
  const t = useDictionary();
  const [ids, setIds] = useState(() => workout.sets.map((set) => set.id));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const list = useRef<HTMLFieldSetElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const focusAfterSave = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );
  useEffect(() => {
    if (!pending) setIds(workout.sets.map((set) => set.id));
  }, [workout.sets, pending]);
  useEffect(() => {
    if (pending || !focusAfterSave.current) return;
    if (failed) {
      refreshButton.current?.focus();
      return;
    }
    const row = list.current?.querySelector<HTMLElement>(
      `[data-set-id="${CSS.escape(focusAfterSave.current)}"]`,
    );
    row?.querySelector<HTMLButtonElement>(".recorded-set-drag-handle")?.focus();
    focusAfterSave.current = null;
  }, [pending, failed]);
  const position = (id: string | number) => String(ids.indexOf(String(id)) + 1);
  async function move({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || inFlight.current || failed) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const previous = ids;
    const next = arrayMove(ids, from, to);
    inFlight.current = true;
    focusAfterSave.current = String(active.id);
    setPending(true);
    setMessage("");
    setIds(next);
    try {
      const data = new FormData();
      data.set("workoutId", workout.id);
      data.set("version", String(workout.version));
      for (const id of next) data.append("setIds", id);
      const result = await reorderWorkoutSetsAction(data);
      if (result) throw new Error("Order not confirmed");
      setMessage(t("reorderSetsSaved"));
    } catch {
      setIds(previous);
      setFailed(true);
      setMessage(t("reorderSetsFailed"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <div className="stack">
      {ids.length > 1 ? (
        <Text size="2" color="gray">
          {t("reorderSetsHelp")}
        </Text>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={(event) => void move(event)}
        accessibility={{
          screenReaderInstructions: { draggable: t("reorderSetsHelp") },
          announcements: {
            onDragStart: ({ active }) =>
              t("reorderSetStart").replace("{position}", position(active.id)),
            onDragOver: ({ over }) =>
              over
                ? t("reorderSetOver").replace("{position}", position(over.id))
                : undefined,
            onDragEnd: ({ over }) =>
              over
                ? t("reorderSetEnd").replace("{position}", position(over.id))
                : t("reorderSetCancel"),
            onDragCancel: () => t("reorderSetCancel"),
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <fieldset
            className="form-fields recorded-set-list"
            ref={list}
            disabled={pending || failed}
            aria-label={t("setsMetric")}
            aria-busy={pending}
          >
            {ids.map((id, index) => {
              const set = workout.sets.find((set) => set.id === id);
              return set ? (
                <RecordedSet
                  key={set.id}
                  set={set}
                  position={index + 1}
                  workoutId={workout.id}
                  exercises={exercises}
                  sortingDisabled={pending || failed || ids.length < 2}
                />
              ) : null;
            })}
          </fieldset>
        </SortableContext>
      </DndContext>
      <Text size="2" role={failed ? "alert" : "status"}>
        {message}
      </Text>
      {failed ? (
        <Button
          highContrast
          ref={refreshButton}
          type="button"
          variant="soft"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await queryClient.invalidateQueries(
                { queryKey: ["view"] },
                { throwOnError: true },
              );
              setFailed(false);
              setMessage("");
            } catch {
              setMessage(t("reorderSetsFailed"));
            } finally {
              setPending(false);
            }
          }}
        >
          {t("refreshSetOrder")}
        </Button>
      ) : null}
    </div>
  );
}
