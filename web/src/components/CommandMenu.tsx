import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";

export type Command = {
  id: string;
  title: string;
  detail: string;
  action: () => void;
  disabled?: boolean;
};

export function CommandMenu({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = commands.filter(
    (c) =>
      !c.disabled &&
      `${c.title} ${c.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  const activeIndex = Math.min(selected, Math.max(0, matches.length - 1));
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    const node = dialog.current;
    node?.showModal();
    input.current?.focus();
    return () => {
      node?.close();
      trigger?.focus();
    };
  }, []);
  const execute = (command: Command) => {
    onClose();
    command.action();
  };
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-label="Search workspace"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          if (
            e.clientY < rect.top ||
            e.clientY > rect.bottom ||
            e.clientX < rect.left ||
            e.clientX > rect.right
          )
            onClose();
        }
      }}
    >
      <div className="command-input">
        <Search size={19} />
        <input
          ref={input}
          role="combobox"
          aria-label="Search commands and evidence"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={
            matches[activeIndex]
              ? `command-${matches[activeIndex].id}`
              : undefined
          }
          placeholder="Search actions, sources, and customers…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSelected(
                (activeIndex +
                  (e.key === "ArrowDown" ? 1 : -1) +
                  matches.length) %
                  Math.max(1, matches.length),
              );
            }
            if (e.key === "Enter" && matches[activeIndex]) {
              e.preventDefault();
              execute(matches[activeIndex]);
            }
          }}
        />
        <button
          onClick={onClose}
          aria-labelledby="close-search-shortcut close-search-label"
        >
          <kbd id="close-search-shortcut">esc</kbd>
          <span id="close-search-label" className="sr-only">
            Close search
          </span>
        </button>
      </div>
      <div
        className="command-results"
        id="command-results"
        role="listbox"
        aria-label="Results"
      >
        {matches.map((command, index) => (
          <div
            role="option"
            aria-selected={index === activeIndex}
            id={`command-${command.id}`}
            key={command.id}
            onMouseMove={() => setSelected(index)}
            onClick={() => execute(command)}
          >
            <span>
              <strong>{command.title}</strong>
              <small>{command.detail}</small>
            </span>
            <ArrowUpRight size={16} />
          </div>
        ))}
        {!matches.length && (
          <p className="empty-inline">No matching actions or evidence.</p>
        )}
      </div>
      <footer>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> to navigate
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
      </footer>
    </dialog>
  );
}
