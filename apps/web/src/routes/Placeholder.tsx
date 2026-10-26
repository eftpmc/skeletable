import { EmptyState, ScreenTitle } from "@closet/ui";

export function Placeholder({ title, heading, body }: { title: string; heading: string; body: string }) {
  return (
    <section className="pt-4 md:pt-0">
      <ScreenTitle>{title}</ScreenTitle>
      <EmptyState className="mt-6" title={heading} body={body} />
    </section>
  );
}
