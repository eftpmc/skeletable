import type { Column } from "./format.js";

/**
 * Ready-made tables for the things people keep: each has its columns set up, and a prompt that
 * hands it to the person's own agent to fill. Shared by the site and the MCP server, so a template
 * means the same table wherever it's started.
 */
export type Template = {
  id: string;
  title: string;
  // One line on the card.
  summary: string;
  // What the row names are, shown above the first column.
  rowsAre: string;
  question: string;
  topic: string;
  scope: string;
  columns: (Pick<Column, "label" | "type" | "rule"> & Partial<Pick<Column, "unit" | "instruction" | "choices">>)[];
  // What to ask the agent, given the table's owner/slug and what the person said it's about.
  prompt: (at: string, about: string) => string;
};

const origins = "Say truthfully where each value came from with `origin`: `imported` with a `note` naming the email or file, `entered` if I told you, `link` with its `source` if it came from a page, or `generated` if you worked it out. Values don't need a web page behind them.";

export const templates: Template[] = [
  {
    id: "job-tracker",
    title: "Job applications",
    summary: "Every application, where it stands and what's next, kept current from your email.",
    rowsAre: "Company",
    question: "Where does each job application stand, and what do I do next?",
    topic: "Career",
    scope: "Jobs I've applied to or plan to, one row per company and role.",
    columns: [
      { label: "Role", type: "text", rule: "The job title as posted." },
      { label: "Status", type: "text", rule: "Where the application stands.", choices: ["Interested", "Applied", "Interviewing", "Offer", "Rejected", "Withdrawn"] },
      { label: "Applied", type: "date", rule: "The day I applied." },
      { label: "Follow up", type: "date", rule: "When to chase it or prepare for the next step." },
      { label: "Next step", type: "text", rule: "What I do next, in a few words." },
      { label: "Link", type: "text", rule: "The posting or the latest email." },
    ],
    prompt: (at, about) =>
      `Use the Skeletable MCP server to fill my job applications table ${at}. Read my job emails in Gmail${about ? ` and ${about}` : ", and any notes I point you to,"} and add one row per company with add_rows, named by the company, with its role, status, the day I applied, a follow-up date and the next step. ${origins} When you run this again later, send every company again: rows it already has are updated. Tell me what changed and anything you weren't sure about.`,
  },
  {
    id: "text-dataset",
    title: "Text dataset",
    summary: "Labeled examples to train or test a classifier, ready to load in a notebook.",
    rowsAre: "Example",
    question: "What label does each piece of text have?",
    topic: "Machine learning",
    scope: "Short texts, each with one label, for training or testing a text classifier.",
    columns: [
      { label: "Text", type: "text", rule: "One example, a sentence or two." },
      { label: "Label", type: "text", rule: "The one label this text belongs to." },
    ],
    prompt: (at, about) =>
      `Use the Skeletable MCP server to build a labeled text dataset in my table ${at}${about ? `, about ${about}` : ""}. Decide on 4 to 8 labels and tell me what they are, then add about 300 varied examples, balanced across the labels, with add_rows, up to 500 at a time. ${origins} When you're done, save a version with save_version and give me a data_link I can load with pandas.`,
  },
  {
    id: "reading-list",
    title: "Reading list",
    summary: "What you want to read, what you're reading, and what you thought.",
    rowsAre: "Title",
    question: "What am I reading, and what did I think?",
    topic: "Reading",
    scope: "Books and long reads I want to read, am reading, or have finished.",
    columns: [
      { label: "Author", type: "text", rule: "Who wrote it." },
      { label: "Status", type: "text", rule: "Where I am with it.", choices: ["Want to read", "Reading", "Finished", "Put down"] },
      { label: "Started", type: "date", rule: "The day I started." },
      { label: "Finished", type: "date", rule: "The day I finished." },
      { label: "Rating", type: "number", rule: "Out of 5." },
      { label: "Notes", type: "text", rule: "What stayed with me." },
    ],
    prompt: (at, about) =>
      `Use the Skeletable MCP server to fill my reading list ${at}${about ? ` from ${about}` : " from what I tell you and any notes I point you to"}. Add one row per book with add_rows, named by its title, with the author and where I am with it. ${origins} Ask me before guessing a rating.`,
  },
  {
    id: "research-notes",
    title: "Research notes",
    summary: "Sources and what each one says, with a topic your agent fills in.",
    rowsAre: "Source",
    question: "What does each source say?",
    topic: "Research",
    scope: "Articles, papers and pages I've read for a question, one row per source.",
    columns: [
      { label: "Link", type: "text", rule: "Where to find it." },
      { label: "Key point", type: "text", rule: "What it says that matters, in a sentence or two." },
      { label: "Read on", type: "date", rule: "The day I read it." },
      { label: "Topic", type: "text", rule: "A short topic for grouping.", instruction: "Give a one- to three-word topic for this point: {Key point}" },
    ],
    prompt: (at, about) =>
      `Use the Skeletable MCP server to keep my research notes in ${at}${about ? `, about ${about}` : ""}. For each source I give you, read it and add a row with add_rows, named by its title, with its link as \`source\` and \`origin: "link"\`, and its key point in a sentence or two. Then fill the Topic column: call next_ai_cells, answer each prompt, and send the answers with fill_ai_cells until it's done.`,
  },
];

export const templateById = (id: string) => templates.find((template) => template.id === id);
