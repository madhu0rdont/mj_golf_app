import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClubCard } from './ClubCard';
import type { Club } from '../../models/club';
import { reorderClubs } from '../../hooks/useClubs';

interface ClubListProps {
  clubs: Club[];
}

function SortableClubCard({ club }: { club: Club }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: club.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ClubCard club={club} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export function ClubList({ clubs }: ClubListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = clubs.findIndex((c) => c.id === active.id);
    const newIndex = clubs.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(clubs, oldIndex, newIndex);
    await reorderClubs(reordered.map((c) => c.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clubs.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {clubs.map((club) => (
            <SortableClubCard key={club.id} club={club} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
