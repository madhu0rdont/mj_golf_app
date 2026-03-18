export interface WeatherConditions {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  windCardinal: string;
  pressure: number;
  description: string;
  fetchedAt: number;
}

export interface HoleWeatherAdjustment {
  holeNumber: number;
  par: number;
  yardage: number;
  heading: number;
  headwindMph: number;
  crosswindMph: number;
  windCarryPct: number;
  tempAdjustYards: number;
  carryAdjustYards: number;
  playsLikeYardage: number;
}
