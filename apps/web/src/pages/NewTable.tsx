import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Content, SignInLink } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { postJson, useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

/** New table opens a blank sheet straight away, the way a new spreadsheet does. */
export function NewTable() {
  const { user } = useMe();
  const [, navigate] = useLocation();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const open = async () => {
    setFailed(false);
    const { ok, data } = await postJson<{ owner: string; slug: string }>("/api/tables/blank");
    if (ok) navigate(`/${data.owner}/${data.slug}/sheet`, { replace: true });
    else setFailed(true);
  };

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    void open();
  });

  if (!user) {
    return (
      <Page>
        <Content size="narrow"><Message title="Sign in to create a table" action={<SignInLink />} /></Content>
      </Page>
    );
  }
  if (!failed) return null;
  return (
    <Page crumbs={[{ label: "New table" }]}>
      <Content size="narrow"><Message title="That sheet didn't open" action={<Button variant="outline" size="sm" onClick={() => void open()}>Try again</Button>} /></Content>
    </Page>
  );
}
