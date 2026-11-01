const shortcuts = [
  ["/", "Find in the table"],
  ["F", "Open filters"],
  ["X", "Turn X-ray on or off"],
  ["Type", "Start editing the selected cell, where you can edit"],
  ["Enter", "Edit the selected cell, or save and move down"],
  ["Tab", "Save and move right"],
  ["N", "Go to the next cell that needs proof, with no cell selected"],
  ["?", "Show these shortcuts"],
  ["Arrow keys", "Move between cells"],
  ["Ctrl or ⌘ + C", "Copy the selected value"],
  ["Esc", "Clear the selection"],
];

export const Shortcuts = () => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
    {shortcuts.map(([keys, action]) => (
      <div key={keys} className="contents">
        <dt><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd></dt>
        <dd className="text-muted-foreground">{action}</dd>
      </div>
    ))}
  </dl>
);
