import {
  BookOpen,
  Film,
  Tv,
  Gamepad2,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";
import HeroCta from "@/components/hero-cta";
import BottomCta from "@/components/bottom-cta";

const mediaTypes = [
  { label: "Books", icon: BookOpen, color: "text-accent-book", bg: "bg-accent-book/10" },
  { label: "Movies", icon: Film, color: "text-accent-movie", bg: "bg-accent-movie/10" },
  { label: "TV Shows", icon: Tv, color: "text-accent-tv", bg: "bg-accent-tv/10" },
  { label: "Video Games", icon: Gamepad2, color: "text-accent-game", bg: "bg-accent-game/10" },
];

const valueProps = [
  {
    icon: Layers,
    title: "One shelf for everything",
    description:
      "Track movies, TV, books, and games in a single place. No more switching between five different apps.",
  },
  {
    icon: Sparkles,
    title: "Cross-media recommendations",
    description:
      'Loved a book? Discover the movie, game, and TV show that share its DNA. "If you liked X, try Y" — across all media.',
  },
  {
    icon: Users,
    title: "Curated lists & community",
    description:
      'Build and share cross-media lists like "Things that feel like Annihilation" — spanning books, films, and games.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <section className="flex flex-col items-center px-4 pt-20 pb-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
          All your entertainment.{" "}
          <span className="text-brand">One shelf.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-text-secondary">
          Track what you watch, read, and play. Get recommendations that cross
          media boundaries. Discover your next favorite anything.
        </p>

        <HeroCta />

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {mediaTypes.map((type) => (
            <div
              key={type.label}
              className={`flex items-center gap-2 rounded-full ${type.bg} px-4 py-2`}
            >
              <type.icon size={16} className={type.color} />
              <span className={`text-sm font-medium ${type.color}`}>
                {type.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-16 sm:grid-cols-3">
        {valueProps.map((prop) => (
          <div key={prop.title} className="glass p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
              <prop.icon size={20} className="text-brand" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              {prop.title}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {prop.description}
            </p>
          </div>
        ))}
      </section>

      <BottomCta />
    </div>
  );
}
