"use client";

// SkillDragAndDrop — drag-and-drop selector for the 5 must_have_tags
// src/components/onboarding/SkillDragAndDrop.tsx
//
// Renders two columns:
//   - Available skills (left): all canonical skills detected in the CV that are
//     NOT currently selected as must_have_tags for this persona.
//   - Must-have skills (right): the 5 selected tags, orderable via drag-and-drop.
//
// The user drags skills from "available" to "must-have" (or clicks to move
// them). Exactly 5 must_have_tags are required (enforced by Zod on submit, but
// the UI prevents adding a 6th). Order matters — the first tag is treated as
// the anchor persona_defining tag in downstream matching.

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CANONICAL_TAG_MAP } from "@/lib/jobs/tech-tags";

const MAX_MUST_HAVE = 5;

type SortableTagProps = {
  tag: string;
  onRemove: (tag: string) => void;
};

function SortableTag({ tag, onRemove }: SortableTagProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const label = CANONICAL_TAG_MAP.get(tag)?.label ?? tag;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border-soft bg-card px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground"
        aria-label={`Drag ${label} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm">{label}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${label}`}
        onClick={() => onRemove(tag)}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

type DraggableBadgeProps = {
  tag: string;
  disabled: boolean;
  onClick: () => void;
};

function DraggableBadge({ tag, disabled, onClick }: DraggableBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `available-${tag}`,
      data: { tag, source: "available" },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "grab",
  };

  const label = CANONICAL_TAG_MAP.get(tag)?.label ?? tag;

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={style}
      {...attributes}
      {...listeners}
      className="disabled:opacity-40"
      aria-label={`Add ${label} to must-have tags`}
    >
      <Badge variant="outline" className="hover:bg-muted">
        {label}
      </Badge>
    </button>
  );
}

type SkillDragAndDropProps = {
  /** All canonical skills detected in the CV (the full pool). */
  availableSkills: string[];
  /** The currently selected must-have tags (max 5), in priority order. */
  mustHaveTags: string[];
  /** Called when the must-have tags change (add, remove, or reorder). */
  onChange: (next: string[]) => void;
};

export function SkillDragAndDrop({
  availableSkills,
  mustHaveTags,
  onChange,
}: SkillDragAndDropProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const mustHaveSet = new Set(mustHaveTags);
  const remaining = availableSkills.filter((tag) => !mustHaveSet.has(tag));
  const isFull = mustHaveTags.length >= MAX_MUST_HAVE;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTag =
      (active.data.current?.tag as string | undefined) ??
      (active.id as string).replace(/^available-/, "");
    const overId = over.id as string;

    const activeIsAvailable = (active.id as string).startsWith("available-");
    const activeIsMustHave = mustHaveTags.includes(activeTag);
    const overIsMustHave = mustHaveTags.includes(overId);

    // Case 1: Reordering within the must-have list
    if (activeIsMustHave && overIsMustHave) {
      const oldIndex = mustHaveTags.indexOf(activeTag);
      const newIndex = mustHaveTags.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onChange(arrayMove(mustHaveTags, oldIndex, newIndex));
      }
      return;
    }

    // Case 2: Dragging from available into must-have list
    if (activeIsAvailable && overIsMustHave) {
      if (isFull || mustHaveSet.has(activeTag)) return;
      const overIndex = mustHaveTags.indexOf(overId);
      const next = [...mustHaveTags];
      if (overIndex === -1) {
        next.push(activeTag);
      } else {
        next.splice(overIndex, 0, activeTag);
      }
      onChange(next.slice(0, MAX_MUST_HAVE));
      return;
    }

    // Case 3: Dragging from available onto the empty droppable container
    if (activeIsAvailable && overId === "must-have-droppable") {
      if (isFull || mustHaveSet.has(activeTag)) return;
      onChange([...mustHaveTags, activeTag]);
    }
  };

  const addTag = (tag: string) => {
    if (isFull || mustHaveSet.has(tag)) return;
    onChange([...mustHaveTags, tag]);
  };

  const removeTag = (tag: string) => {
    onChange(mustHaveTags.filter((t) => t !== tag));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Available skills */}
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Available skills ({remaining.length})
          </h4>
          <div className="flex flex-wrap gap-2 min-h-[3rem] rounded-md border border-border-soft bg-muted/20 p-3">
            {remaining.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                All skills selected.
              </span>
            ) : (
              remaining.map((tag) => (
                <DraggableBadge
                  key={tag}
                  tag={tag}
                  disabled={isFull}
                  onClick={() => addTag(tag)}
                />
              ))
            )}
          </div>
          {isFull && (
            <p className="text-xs text-muted-foreground">
              Maximum of {MAX_MUST_HAVE} must-have tags reached. Remove one to
              add another.
            </p>
          )}
        </div>

        {/* Must-have skills (sortable + droppable) */}
        <MustHaveColumn mustHaveTags={mustHaveTags} onRemove={removeTag} />
      </div>
    </DndContext>
  );
}

type MustHaveColumnProps = {
  mustHaveTags: string[];
  onRemove: (tag: string) => void;
};

function MustHaveColumn({ mustHaveTags, onRemove }: MustHaveColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "must-have-droppable" });

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-muted-foreground">
        Must-have tags ({mustHaveTags.length}/{MAX_MUST_HAVE}) — drag to reorder
      </h4>
      <SortableContext
        items={mustHaveTags}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={`flex flex-col gap-2 min-h-[3rem] rounded-md border p-3 transition-colors ${
            isOver
              ? "border-primary bg-primary/5"
              : "border-border-soft border-dashed"
          }`}
        >
          {mustHaveTags.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              Drag or click skills from the left to select your 5
              persona-defining tags.
            </li>
          ) : (
            mustHaveTags.map((tag) => (
              <SortableTag key={tag} tag={tag} onRemove={onRemove} />
            ))
          )}
        </ul>
      </SortableContext>
    </div>
  );
}

export { MAX_MUST_HAVE as MAX_MUST_HAVE_TAGS };
export type { SkillDragAndDropProps };
