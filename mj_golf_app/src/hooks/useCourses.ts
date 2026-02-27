import useSWR, { mutate } from 'swr';
import { fetcher } from '../lib/fetcher';
import type { Course, CourseWithHoles, CourseHole } from '../models/course';

export function useCourses() {
  const { data, isLoading } = useSWR<Course[]>('/api/courses', fetcher);
  return { courses: data, isLoading };
}

export function useCourse(id: string | undefined) {
  const { data, isLoading } = useSWR<CourseWithHoles>(
    id ? `/api/courses/${id}` : null,
    fetcher,
  );
  return { course: data, isLoading };
}

export function useHole(courseId: string | undefined, holeNumber: number | undefined) {
  const { data, isLoading } = useSWR<CourseHole>(
    courseId && holeNumber != null
      ? `/api/courses/${courseId}/holes/${holeNumber}`
      : null,
    fetcher,
  );
  return { hole: data, isLoading };
}

export function mutateCourses() {
  return mutate('/api/courses');
}

export function mutateCourse(id: string) {
  return mutate(`/api/courses/${id}`);
}
