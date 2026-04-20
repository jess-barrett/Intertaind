import Link from "next/link";
import { BookOpen, Film, Tv, Gamepad2, Heart, User, ArrowRight } from "lucide-react";
import type { MediaItem, MediaType, List, Profile } from "@/lib/types";
import { MEDIA_TYPE_CONFIG } from "@/lib/types";
import MediaCard from "@/components/media-card";

const MEDIA_ICONS: Record<MediaType, React.ElementType> = {
  movie: Film,
  tv_show: Tv,
  book: BookOpen,
  video_game: Gamepad2,
};

function SectionHeader({
  title,
  href,
  icon: Icon,
  iconColor,
}: {
  title: string;
  href: string;
  icon?: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={18} className={iconColor} />}
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        See all <ArrowRight size={12} />
      </Link>
    </div>
  );
}

export default function DiscoveryFeed({
  displayName,
  popularMovies,
  popularShows,
  popularBooks,
  popularGames,
  popularLists,
}: {
  displayName: string;
  popularMovies: MediaItem[];
  popularShows: MediaItem[];
  popularBooks: MediaItem[];
  popularGames: MediaItem[];
  popularLists: (List & { profiles: Profile })[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Welcome */}
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-2 text-text-secondary">Discover something new</p>
      </div>

      {/* Popular Lists */}
      {popularLists.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Popular Lists" href="/lists" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {popularLists.slice(0, 3).map((list) => (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="glass block p-4 transition-colors hover:border-brand/30"
              >
                <h3 className="font-semibold text-text-primary">
                  {list.title}
                </h3>
                {list.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                    {list.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                  {list.profiles && (
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {list.profiles.display_name || list.profiles.username}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Heart size={10} />
                    {list.like_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Popular media — 2x2 grid */}
      <div className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {popularMovies.length > 0 && (
          <section>
            <SectionHeader
              title="Popular Movies"
              href="/movies"
              icon={Film}
              iconColor="text-accent-movie"
            />
            <div className="grid grid-cols-4 gap-2">
              {popularMovies.slice(0, 4).map((item) => (
                <MediaCard key={item.id} item={item} compact />
              ))}
            </div>
          </section>
        )}

        {popularBooks.length > 0 && (
          <section>
            <SectionHeader
              title="Popular Books"
              href="/books"
              icon={BookOpen}
              iconColor="text-accent-book"
            />
            <div className="grid grid-cols-4 gap-2">
              {popularBooks.slice(0, 4).map((item) => (
                <MediaCard key={item.id} item={item} compact />
              ))}
            </div>
          </section>
        )}

        {popularShows.length > 0 && (
          <section>
            <SectionHeader
              title="Popular Shows"
              href="/tv-shows"
              icon={Tv}
              iconColor="text-accent-tv"
            />
            <div className="grid grid-cols-4 gap-2">
              {popularShows.slice(0, 4).map((item) => (
                <MediaCard key={item.id} item={item} compact />
              ))}
            </div>
          </section>
        )}

        {popularGames.length > 0 && (
          <section>
            <SectionHeader
              title="Popular Games"
              href="/games"
              icon={Gamepad2}
              iconColor="text-accent-game"
            />
            <div className="grid grid-cols-4 gap-2">
              {popularGames.slice(0, 4).map((item) => (
                <MediaCard key={item.id} item={item} compact />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Empty state if nothing is popular yet */}
      {popularMovies.length === 0 &&
        popularShows.length === 0 &&
        popularBooks.length === 0 &&
        popularGames.length === 0 &&
        popularLists.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-lg text-text-secondary">
              Nothing to discover yet
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Start by searching for something you love.
            </p>
            <Link
              href="/search"
              className="mt-4 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Search
            </Link>
          </div>
        )}
    </div>
  );
}
