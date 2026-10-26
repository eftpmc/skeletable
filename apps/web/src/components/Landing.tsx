import { BellIcon, CheckIcon, PackageIcon, SearchIcon, buttonClass, cn, focusRing } from "@closet/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";

const REPO = "https://github.com/eftpmc/skeleton";

const features: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <SearchIcon size={22} />,
    title: "Every store, one search",
    body: "Big retailers, marketplaces and independent shops at once. Paste a product link to find it everywhere else.",
  },
  {
    icon: <PackageIcon size={22} />,
    title: "New, used and refurbished",
    body: "Side by side, so the cheapest good option shows up even when it's secondhand.",
  },
  {
    icon: <CheckIcon size={22} />,
    title: "A straight answer on price",
    body: "Each product says whether today's price is good, judged against what it has sold for before.",
  },
  {
    icon: <BellIcon size={22} />,
    title: "Alerts when it drops",
    body: "Save a search or track a product, and hear about new matches and price drops.",
  },
];

/** What signed-out visitors see under the search: what it does, who it works for, and how to run your own. */
export function Landing() {
  return (
    <div className="mt-14 lg:mt-20">
      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
        {features.map((f) => (
          <li key={f.title}>
            <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink">{f.icon}</span>
            <h2 className="mt-4 text-title-3 text-ink">{f.title}</h2>
            <p className="mt-1.5 text-callout font-normal text-muted">{f.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-16 grid gap-4 lg:mt-24 lg:grid-cols-2 lg:gap-5">
        <section className="rounded-[28px] bg-surface px-6 py-8 lg:px-10 lg:py-12">
          <h2 className="text-title-1 text-ink">We work for you.</h2>
          <p className="mt-3 max-w-md text-body font-normal text-muted">
            No sponsored results, and stores can't pay to rank higher. Results are ordered by how well they match and what they
            cost, nothing else.
          </p>
        </section>
        <section className="rounded-[28px] bg-ink px-6 py-8 text-on-ink lg:px-10 lg:py-12">
          <h2 className="text-title-1">Host it yourself.</h2>
          <p className="mt-3 max-w-md text-body font-normal opacity-75">
            Run your own private copy with Docker. Bring your own store keys, and your searches, alerts and collection stay on your
            machine.
          </p>
          <a
            href={`${REPO}#self-host`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("mt-6 inline-flex h-11 items-center rounded-full bg-canvas px-5 text-callout font-semibold text-ink", focusRing)}
          >
            Self-hosting guide
          </a>
        </section>
      </div>

      <section className="mt-16 flex flex-col items-center text-center lg:mt-24">
        <h2 className="text-title-1 text-ink">Keep what you find.</h2>
        <p className="mt-2 max-w-sm text-body font-normal text-muted">
          A free account saves searches, tracks prices and keeps your collection in one place.
        </p>
        <Link to="/sign-up" className={buttonClass({ className: "mt-6 px-8" })}>
          Get started
        </Link>
      </section>

      <footer className="mt-20 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-6 text-footnote text-muted">
        <span className="font-semibold text-ink">skeleton</span>
        <a href={REPO} target="_blank" rel="noopener noreferrer" className={cn("rounded-sm hover:text-ink", focusRing)}>
          GitHub
        </a>
        <a href={`${REPO}#self-host`} target="_blank" rel="noopener noreferrer" className={cn("rounded-sm hover:text-ink", focusRing)}>
          Self-host
        </a>
      </footer>
    </div>
  );
}
