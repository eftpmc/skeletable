import { useRoute } from "wouter";
import { Home } from "@/pages/Home";
import { Message } from "@/pages/Message";
import { Sheet } from "@/pages/Sheet";

export function App() {
  const [isHome] = useRoute("/");
  const [isTable, params] = useRoute("/:owner/:slug");
  if (isHome) return <Home />;
  if (isTable) return <Sheet key={`${params.owner}/${params.slug}`} owner={params.owner} slug={params.slug} />;
  return <Message title="There's no page here" />;
}
