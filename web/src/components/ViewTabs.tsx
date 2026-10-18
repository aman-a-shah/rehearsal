import type { KeyboardEvent } from "react";

export function ViewTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  function move(event: KeyboardEvent, index: number) {
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index + items.length - 1) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : -1;
    if (target < 0) return;
    event.preventDefault();
    onChange(items[target].id);
    (
      event.currentTarget.parentElement?.children[target] as HTMLButtonElement
    )?.focus();
  }
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          role="tab"
          id={`tab-${item.id}`}
          aria-controls={`view-${item.id}`}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onKeyDown={(event) => move(event, index)}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="tab-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
