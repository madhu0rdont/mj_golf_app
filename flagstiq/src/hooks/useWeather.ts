import useSWR from 'swr';
import { fetcher } from '../lib/fetcher';
import type { WeatherConditions, HoleWeatherAdjustment } from '../services/weather';

interface WeatherResponse {
  weather: WeatherConditions;
  adjustments: HoleWeatherAdjustment[];
  courseTotalAdjust: number;
}

export function useWeather(courseId: string | undefined, teeBox: string) {
  const { data, isLoading, error } = useSWR<WeatherResponse>(
    courseId ? `/api/weather/${courseId}?teeBox=${teeBox}` : null,
    fetcher,
    { refreshInterval: 15 * 60 * 1000 },
  );

  return {
    weather: data?.weather ?? null,
    adjustments: data?.adjustments ?? null,
    courseTotalAdjust: data?.courseTotalAdjust ?? 0,
    isLoading,
    error,
  };
}
