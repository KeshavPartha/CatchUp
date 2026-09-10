export type MediaType = 'movie' | 'tv';

export interface Movie {
  id: number;
  media_type: 'movie';
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
}

export interface Episode {
  id: string;
  show_id: number;
  season_id: string;
  season_number: number;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
  still_path: string;
}

export interface Season {
  id: string;
  show_id: number;
  season_number: number;
  name: string;
  overview: string;
  episodes: Episode[];
}

export interface TVShow {
  id: number;
  media_type: 'tv';
  name: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  first_air_date: string;
  vote_average: number;
}

export interface MovieDetails extends Movie {
  genres: string[];
  cast: string[];
}

export interface TVShowDetails extends TVShow {
  genres: string[];
  cast: string[];
  seasons: Season[];
}

export type CatalogSearchResult = Movie | TVShow;

const episode = (
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
  name: string,
  overview: string,
  runtime: number,
  stillPath: string
): Episode => ({
  id: `show-${showId}-s${seasonNumber}-e${episodeNumber}`,
  show_id: showId,
  season_id: `show-${showId}-s${seasonNumber}`,
  season_number: seasonNumber,
  episode_number: episodeNumber,
  name,
  overview,
  runtime,
  still_path: stillPath,
});

const shows: TVShowDetails[] = [
  {
    id: 1001,
    media_type: 'tv',
    name: 'Echoes of Orion',
    overview:
      'A salvage crew follows a repeating signal across the outer planets and discovers that the missing colony ships may still be listening.',
    poster_path: '/demo/echoes-of-orion-poster.svg',
    backdrop_path: '/demo/echoes-of-orion-backdrop.svg',
    first_air_date: '2025-03-14',
    vote_average: 8.7,
    genres: ['Science Fiction', 'Mystery'],
    cast: ['Mara Venn', 'Ilya Cross', 'Jun Park'],
    seasons: [
      {
        id: 'show-1001-s1',
        show_id: 1001,
        season_number: 1,
        name: 'Season 1',
        overview: 'The crew of the Wayfinder traces an impossible distress signal.',
        episodes: [
          episode(1001, 1, 1, 'The Long Signal', 'The Wayfinder hears a signal that matches no known transmitter.', 42, '/demo/echoes-of-orion-backdrop.svg'),
          episode(1001, 1, 2, 'Dead Air', 'A silent moon reveals evidence that someone anticipated the crew’s arrival.', 44, '/demo/echoes-of-orion-backdrop.svg'),
          episode(1001, 1, 3, 'The Listening Room', 'Mara finds a hidden archive that responds to her family name.', 46, '/demo/echoes-of-orion-backdrop.svg'),
        ],
      },
      {
        id: 'show-1001-s2',
        show_id: 1001,
        season_number: 2,
        name: 'Season 2',
        overview: 'The signal becomes a map, but every answer changes what the crew can trust.',
        episodes: [
          episode(1001, 2, 1, 'Return Vector', 'The crew returns to the signal’s origin and finds a colony beacon still powered.', 45, '/demo/echoes-of-orion-backdrop.svg'),
          episode(1001, 2, 2, 'Borrowed Light', 'Ilya risks the mission to rescue a stranger who knows the Wayfinder’s route.', 47, '/demo/echoes-of-orion-backdrop.svg'),
          episode(1001, 2, 3, 'Orion Falls', 'The crew must choose whether to answer the signal or shut it down forever.', 49, '/demo/echoes-of-orion-backdrop.svg'),
        ],
      },
    ],
  },
  {
    id: 1002,
    media_type: 'tv',
    name: 'The Quiet Between',
    overview:
      'In a coastal town where every clock stops at the same minute, a sound archivist investigates the memories hidden inside the silence.',
    poster_path: '/demo/the-quiet-between-poster.svg',
    backdrop_path: '/demo/the-quiet-between-backdrop.svg',
    first_air_date: '2024-10-02',
    vote_average: 8.3,
    genres: ['Drama', 'Mystery'],
    cast: ['Sana Bell', 'Theo March', 'Anika Reed'],
    seasons: [
      {
        id: 'show-1002-s1',
        show_id: 1002,
        season_number: 1,
        name: 'Season 1',
        overview: 'Sana records a town-wide silence and finds a pattern in what people cannot hear.',
        episodes: [
          episode(1002, 1, 1, 'The Minute Hand', 'Every clock in Bellwether stops at 8:17, and Sana hears a voice inside the quiet.', 41, '/demo/the-quiet-between-backdrop.svg'),
          episode(1002, 1, 2, 'Low Tide', 'A recording from beneath the pier connects the silence to Sana’s missing mentor.', 43, '/demo/the-quiet-between-backdrop.svg'),
          episode(1002, 1, 3, 'A Room Without Echo', 'Theo admits he has been hiding the first recording since childhood.', 45, '/demo/the-quiet-between-backdrop.svg'),
        ],
      },
      {
        id: 'show-1002-s2',
        show_id: 1002,
        season_number: 2,
        name: 'Season 2',
        overview: 'The archive expands beyond Bellwether and forces Sana to decide who should hear the truth.',
        episodes: [
          episode(1002, 2, 1, 'The Far Shore', 'Sana discovers the same stopped minute in a town across the water.', 44, '/demo/the-quiet-between-backdrop.svg'),
          episode(1002, 2, 2, 'Signal Fires', 'Anika maps a chain of lighthouse flashes that mirrors the hidden recordings.', 46, '/demo/the-quiet-between-backdrop.svg'),
          episode(1002, 2, 3, 'What Remains', 'The team opens the archive and hears a message meant for the future.', 48, '/demo/the-quiet-between-backdrop.svg'),
        ],
      },
    ],
  },
];

const movies: MovieDetails[] = [
  {
    id: 2001,
    media_type: 'movie',
    title: 'Lanterns at Low Tide',
    overview: 'A night ferry captain follows a trail of lanterns toward a promise made decades ago.',
    poster_path: '/demo/lanterns-at-low-tide-poster.svg',
    backdrop_path: '/demo/lanterns-at-low-tide-backdrop.svg',
    release_date: '2025-01-17',
    vote_average: 7.9,
    genres: ['Adventure', 'Drama'],
    cast: ['Nia Cole', 'Evan Holt'],
  },
  {
    id: 2002,
    media_type: 'movie',
    title: 'Mosaic City',
    overview: 'A cartographer redraws a city overnight and uncovers the lives erased from its official map.',
    poster_path: '/demo/mosaic-city-poster.svg',
    backdrop_path: '/demo/mosaic-city-backdrop.svg',
    release_date: '2024-06-21',
    vote_average: 8.1,
    genres: ['Drama', 'Thriller'],
    cast: ['Rhea Moss', 'Cal Dune'],
  },
];

const delay = async <T,>(value: T): Promise<T> => value;

export const getImageUrl = (path: string | null): string => path || '/placeholder-movie.jpg';
export const getPosterUrl = (path: string | null): string => getImageUrl(path);
export const getBackdropUrl = (path: string | null): string => getImageUrl(path);

export const getTrendingMovies = async (): Promise<Movie[]> => delay(movies);
export const getPopularMovies = async (): Promise<Movie[]> => delay(movies);
export const getTopRatedMovies = async (): Promise<Movie[]> => delay([...movies].sort((a, b) => b.vote_average - a.vote_average));
export const getUpcomingMovies = async (): Promise<Movie[]> => delay([movies[0]]);
export const getNowPlayingMovies = async (): Promise<Movie[]> => delay([movies[1]]);

export const getTrendingTVShows = async (): Promise<TVShow[]> => delay(shows);
export const getPopularTVShows = async (): Promise<TVShow[]> => delay(shows);
export const getTopRatedTVShows = async (): Promise<TVShow[]> => delay([...shows].sort((a, b) => b.vote_average - a.vote_average));
export const getAiringTodayTVShows = async (): Promise<TVShow[]> => delay([shows[1]]);
export const getOnTheAirTVShows = async (): Promise<TVShow[]> => delay([shows[0]]);

export const getMovieDetails = async (movieId: number): Promise<MovieDetails> => {
  const movie = movies.find((item) => item.id === movieId);
  if (!movie) throw new Error('Movie not found');
  return delay(movie);
};

export const getTVShowDetails = async (showId: number): Promise<TVShowDetails> => {
  const show = shows.find((item) => item.id === showId);
  if (!show) throw new Error('Show not found');
  return delay(show);
};

export const getEpisodeById = async (episodeId: string): Promise<Episode> => {
  const found = shows.flatMap((show) => show.seasons.flatMap((season) => season.episodes)).find((item) => item.id === episodeId);
  if (!found) throw new Error('Episode not found');
  return delay(found);
};

export const getShowById = (showId: number): TVShowDetails | undefined => shows.find((show) => show.id === showId);

export const searchCatalog = async (query: string): Promise<CatalogSearchResult[]> => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return delay(
    [...movies, ...shows].filter((item) => {
      const title = item.media_type === 'movie' ? item.title : item.name;
      return `${title} ${item.overview}`.toLowerCase().includes(normalized);
    })
  );
};
