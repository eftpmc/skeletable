import { templateById } from "@skeleton/tables/templates";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Content, PageHeader, SignInLink } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { TemplateCards, useStartTemplate } from "@/components/Templates";
import { Button } from "@/components/ui/button";
import { postJson, useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

/**
 * Starting a table: a blank sheet, or a template with its columns set up. A link with a template
 * in it, like the one sign-in comes back to, starts that template straight away.
 */
export function NewTable() {
  const { user } = useMe();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const asked = templateById(params.get("template") ?? "");
  const { start } = useStartTemplate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const blank = async () => {
    setFailed(false);
    const { ok, data } = await postJson<{ owner: string; slug: string }>("/api/tables/blank");
    if (ok) navigate(`/${data.owner}/${data.slug}/sheet`, { replace: true });
    else setFailed(true);
  };

  useEffect(() => {
    document.title = "New table · Skeletable";
    if (!user || started.current) return;
    if (asked) {
      started.current = true;
      void start(asked);
    } else if (params.has("blank")) {
      started.current = true;
      void blank();
    }
  });

  if (!user) {
    return (
      <Page crumbs={[{ label: "New table" }]}>
        <Content>
          <PageHeader title="Start a table" description="Pick a template to see what it sets up. You'll sign in with Google before it's made." />
          <TemplateCards />
          <div className="mt-6"><SignInLink /></div>
        </Content>
      </Page>
    );
  }
  if (failed) {
    return (
      <Page crumbs={[{ label: "New table" }]}>
        <Content size="narrow"><Message title="That sheet didn't open" action={<Button variant="outline" size="sm" onClick={() => void blank()}>Try again</Button>} /></Content>
      </Page>
    );
  }
  if (asked || params.has("blank")) return null;
  return (
    <Page crumbs={[{ label: "New table" }]}>
      <Content>
        <PageHeader title="Start a table" description="A template sets up the columns and gives your agent a prompt to fill it. Every value says where it came from." />
        <TemplateCards blank onBlank={() => void blank()} />
      </Content>
    </Page>
  );
}
