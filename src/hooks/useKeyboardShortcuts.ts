import { useEffect } from "react";
import { useStore } from "../lib/store";

function focusRow(id: string) {
	requestAnimationFrame(() =>
		document.querySelector<HTMLElement>(`[data-bm="${id}"]`)?.focus(),
	);
}

function moveFocus(direction: 1 | -1, from: HTMLElement | null) {
	const rows = Array.from(
		document.querySelectorAll<HTMLElement>(".row[data-bm]"),
	);
	if (!rows.length) return;

	const current = from ? rows.indexOf(from) : -1;
	let next: number;
	if (current < 0) next = direction === 1 ? 0 : rows.length - 1;
	else next = Math.min(Math.max(current + direction, 0), rows.length - 1);

	const el = rows[next];
	el.focus({ preventScroll: true });
	// Glide when crossing an edge instead of snapping by one row.
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	el.scrollIntoView({
		block: "nearest",
		behavior: reduced ? "auto" : "smooth",
	});
}

export function useKeyboardShortcuts() {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			// Read the store when the key is pressed, so this never goes stale.
			const s = useStore.getState();
			const target = event.target as HTMLElement | null;
			const typing =
				!!target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				if (!s.dialog) s.openSearch();
				return;
			}

			if (typing || s.dialog || s.branchDialog || s.searchOpen) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			if (event.key === "?") {
				event.preventDefault();
				if (s.helpOpen) s.closeHelp();
				else s.openHelp();
				return;
			}

			if (event.key === "/") {
				event.preventDefault();
				s.openSearch();
				return;
			}

			if (event.key === "Escape" && s.confirmId) {
				event.preventDefault();
				const id = s.confirmId;
				s.cancelStash();
				focusRow(id);
				return;
			}

			const key = event.key.toLowerCase();

			if (key === "c") {
				event.preventDefault();
				s.openAdd();
				return;
			}

			const row = target?.closest<HTMLElement>(".row") ?? null;

			if (key === "j" || key === "k") {
				event.preventDefault();
				moveFocus(key === "j" ? 1 : -1, row);
				return;
			}

			const rowId = row?.dataset.bm;
			if (!rowId) return;

			if (key === "r") {
				event.preventDefault();
				void s.toggleRead(rowId);
			} else if (key === "e") {
				event.preventDefault();
				s.openEdit(rowId);
			} else if (key === "s") {
				event.preventDefault();
				if (s.filter === "stashed") void s.restore(rowId);
				else s.askStash(rowId);
			}
		};

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
}
