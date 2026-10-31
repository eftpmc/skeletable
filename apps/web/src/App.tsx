import { useRoute } from "wouter";
import { Message } from "@/pages/Message";
import { Workbook } from "@/pages/Workbook";

export function App() {
  const [isHome] = useRoute("/");
  const [isTable, params] = useRoute("/tables/:slug");
  if (!isHome && !isTable) return <Message title="There's no page here" />;
  return <Workbook slug={params?.slug} />;
}
