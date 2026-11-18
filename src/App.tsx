import { useEffect, useMemo, useRef, useState } from "react";
import {
	Archive,
	Bookmark as BookmarkIcon,
	CheckCircle2,
	Circle,
	Menu,
	Plus,
	Search as SearchIcon,
	X,
} from "lucide-react";
import { BookmarkDialog } from "./components/BookmarkDialog";
import { BookmarkRow } from "./components/BookmarkRow";
import { BranchDialog } from "./components/BranchDialog";
import { BranchSection } from "./components/BranchSection";
import { Logo } from "./components/Logo";
import { Profile } from "./components/Profile";
import { SearchBox } from "./components/SearchBox";
import { descendantsOf } from "./lib/branches";
import type { AuthUser } from "./lib/auth";
import { LOCKUP } from "./lib/brand";
import { useStore } from "./lib/store";
import type { Filter } from "./lib/store";

const TABS: { id: Filter; label: string; icon: typeof BookmarkIcon }[] = [
	{ id: "all", label: "All commits", icon: BookmarkIcon },
	{ id: "unread", label: "Unreviewed", icon: Circle },
	{ id: "read", label: "Reviewed", icon: CheckCircle2 },
	{ id: "stashed", label: "Stashed", icon: Archive },
];

export function App({ user }: { user: AuthUser }) {
	const ready = useStore((s) => s.ready);
	const bookmarks = useStore((s) => s.bookmarks);
	const branches = useStore((s) => s.branches);
	const filter = useStore((s) => s.filter);
	const branch = useStore((s) => s.branch);
	const searchOpen = useStore((s) => s.searchOpen);
	const helpOpen = useStore((s) => s.helpOpen);
	const dialog = useStore((s) => s.dialog);
	const branchDialog = useStore((s) => s.branchDialog);
	const toast = useStore((s) => s.toast);
	const load = useStore((s) => s.load);
	const reset = useStore((s) => s.reset);
	const sync = useStore((s) => s.sync);
	const setFilter = useStore((s) => s.setFilter);
	const setBranch = useStore((s) => s.setBranch);
	const openAdd = useStore((s) => s.openAdd);
	const openSearch = useStore((s) => s.openSearch);
	const openHelp = useStore((s) => s.openHelp);
	const closeHelp = useStore((s) => s.closeHelp);
	const openEdit = useStore((s) => s.openEdit);
	const toggleRead = useStore((s) => s.toggleRead);
	const askStash = useStore((s) => s.askStash);
	const restore = useStore((s) => s.restore);
	const cancelStash = useStore((s) => s.cancelStash);
	const confirmId = useStore((s) => s.confirmId);
	const clearToast = useStore((s) => s.clearToast);

	const lastRow = useRef<string | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		reset();
		void load(user.id);
	}, [load, reset, user.id]);

	// Another device can change the log, so a visible tab checks the revision
	// on a timer and whenever it comes back to the foreground.
	useEffect(() => {
		const check = () => {
			if (!document.hidden) void sync();
		};
		const timer = window.setInterval(check, 15_000);
		window.addEventListener("focus", check);
		document.addEventListener("visibilitychange", check);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", check);
			document.removeEventListener("visibilitychange", check);
		};
	}, [sync]);

	useEffect(() => {
		if (!dialog && !branchDialog && !searchOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [branchDialog, dialog, searchOpen]);

	useEffect(() => {
		if (!menuOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [menuOpen]);

	useEffect(() => {
		if (dialog) {
			const row = (
				document.activeElement as HTMLElement | null
			)?.closest<HTMLElement>(".row");
			if (row?.dataset.bm) lastRow.current = row.dataset.bm;
			return;
		}
		const id = lastRow.current;
		lastRow.current = null;
		if (!id) return;
		requestAnimationFrame(() =>
			document.querySelector<HTMLElement>(`[data-bm="${id}"]`)?.focus(),
		);
	}, [dialog]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				!!target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				if (!dialog) openSearch();
				return;
			}

			if (typing || dialog || branchDialog || searchOpen) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			if (event.key === "?") {
				event.preventDefault();
				if (helpOpen) closeHelp();
				else openHelp();
				return;
			}

			if (event.key === "/") {
				event.preventDefault();
				openSearch();
				return;
			}

			if (event.key === "Escape" && confirmId) {
				event.preventDefault();
				const id = confirmId;
				cancelStash();
				requestAnimationFrame(() =>
					document.querySelector<HTMLElement>(`[data-bm="${id}"]`)?.focus(),
				);
				return;
			}

			const row = target?.closest<HTMLElement>(".row") ?? null;
			const rowId = row?.dataset.bm;

			if (event.key.toLowerCase() === "c") {
				event.preventDefault();
				openAdd();
				return;
			}

			const step = event.key.toLowerCase();
			if (step === "j" || step === "k") {
				event.preventDefault();
				const rows = Array.from(
					document.querySelectorAll<HTMLElement>(".row[data-bm]"),
				);
				if (!rows.length) return;
				const current = row ? rows.indexOf(row) : -1;
				const next =
					step === "j"
						? current < 0
							? 0
							: Math.min(current + 1, rows.length - 1)
						: current < 0
							? rows.length - 1
							: Math.max(current - 1, 0);
				const el = rows[next];
				el.focus({ preventScroll: true });
				// Glide when crossing an edge instead of snapping by one row.
				const reduced = window.matchMedia(
					"(prefers-reduced-motion: reduce)",
				).matches;
				el.scrollIntoView({
					block: "nearest",
					behavior: reduced ? "auto" : "smooth",
				});
				return;
			}

			if (!rowId) return;

			if (step === "r") {
				event.preventDefault();
				void toggleRead(rowId);
			} else if (step === "e") {
				event.preventDefault();
				openEdit(rowId);
			} else if (step === "s") {
				event.preventDefault();
				if (filter === "stashed") void restore(rowId);
				else askStash(rowId);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		askStash,
		branchDialog,
		cancelStash,
		confirmId,
		dialog,
		filter,
		helpOpen,
		openAdd,
		openEdit,
		openHelp,
		closeHelp,
		openSearch,
		restore,
		searchOpen,
		toggleRead,
	]);

	const counts = useMemo(() => {
		const live = bookmarks.filter((item) => !item.archived);
		return {
			all: live.length,
			unread: live.filter((item) => !item.readAt).length,
			read: live.filter((item) => item.readAt).length,
			stashed: bookmarks.length - live.length,
		};
	}, [bookmarks]);

	const selected = useMemo(
		() => (branch ? branches.find((item) => item.id === branch) : undefined),
		[branch, branches],
	);

	const scope = useMemo(
		() => (branch ? descendantsOf(branches, branch) : null),
		[branch, branches],
	);

	const visible = useMemo(() => {
		if (filter === "stashed") {
			return bookmarks.filter((item) => item.archived);
		}

		let list = bookmarks.filter((item) => !item.archived);
		if (filter === "unread") list = list.filter((item) => !item.readAt);
		if (filter === "read") list = list.filter((item) => item.readAt);
		if (scope) {
			list = list.filter((item) => !!item.branchId && scope.has(item.branchId));
		}
		return list;
	}, [bookmarks, filter, scope]);

	const dialogKey =
		dialog?.mode === "edit"
			? `edit-${dialog.id}`
			: dialog?.mode === "add"
				? `add-${dialog.url ?? "blank"}`
				: "none";

	const label =
		filter === "all"
			? "All commits"
			: filter === "unread"
				? "Unreviewed"
				: filter === "read"
					? "Reviewed"
					: "Stashed";

	const statusWord =
		filter === "unread"
			? "unreviewed"
			: filter === "read"
				? "reviewed"
				: filter === "stashed"
					? "stashed"
					: "";

	const emptyHint =
		filter === "unread"
			? "Commits you have not reviewed yet show up here."
			: filter === "read"
				? "Mark a commit as reviewed and it shows up here."
				: filter === "stashed"
					? "Commits you stash show up here."
					: "Your commits show up here.";

	return (
		<div className={`page${menuOpen ? " menu-open" : ""}`}>
			<div className="frame">
				<div className="top-row">
					<div className="top-left">
						<button
							className="menu-btn"
							title="Menu"
							aria-label="Open menu"
							onClick={() => setMenuOpen(true)}
						>
							<Menu size={18} />
						</button>
						<div className="brand">
							<Logo className="brand-logo" />
							{LOCKUP}
						</div>
					</div>
					<div className="brand mobile-brand">
						<Logo className="brand-logo" />
						{LOCKUP}
					</div>
					<div className="top-actions">
						<button className="search-trigger" onClick={openSearch}>
							<SearchIcon size={16} />
							<span className="search-label">Search commits...</span>
							<span className="search-keys" aria-hidden="true">
								<kbd>⌘</kbd>
								<span>+</span>
								<kbd>K</kbd>
							</span>
						</button>
						<Profile compact />
						<button
							className="add-btn"
							title="New commit (C)"
							onClick={() => openAdd()}
						>
							<Plus size={15} />
							<span>New commit</span>
						</button>
					</div>
				</div>

				{menuOpen && (
					<div className="scrim" onClick={() => setMenuOpen(false)} />
				)}

				<div className="layout">
					<aside
						className={`side${menuOpen ? " open" : ""}`}
						onClick={(event) => {
							if ((event.target as HTMLElement).closest("button"))
								setMenuOpen(false);
						}}
					>
						<div className="side-mobile-head">
							<span className="brand">
								<Logo className="brand-logo" />
								{LOCKUP}
							</span>
							<button
								className="icon-btn"
								onClick={() => setMenuOpen(false)}
								aria-label="Close menu"
							>
								<X size={16} />
							</button>
						</div>

						<div className="side-section">Status</div>
						<nav className="side-nav" aria-label="Filters">
							{TABS.map(({ id, label: name, icon: Icon }) => (
								<button
									key={id}
									className={!branch && filter === id ? "act" : undefined}
									onClick={() => setFilter(id)}
								>
									<Icon size={15} />
									<span>{name}</span>
									<span className="side-count">{counts[id]}</span>
								</button>
							))}
						</nav>

						<BranchSection />

						<Profile />
					</aside>

					<main className="main">
						<div className="collection-head">
							<div className="collection-title">
								<h1>
									{selected ? (
										<>
											<span className="hash">#</span>
											{selected.name}
										</>
									) : (
										label
									)}
								</h1>
								<span className="collection-count">{visible.length}</span>
							</div>
						</div>

						{!ready ? (
							<div className="state">
								<span className="spin-ring" />
								<p>Opening the log...</p>
							</div>
						) : bookmarks.length === 0 ? (
							<div className="state empty">
								<h2>No commits yet</h2>
								<p>Paste a remote and commit it.</p>
								<button className="add-btn" onClick={() => openAdd()}>
									<Plus size={15} /> Commit the first remote
								</button>
							</div>
						) : visible.length === 0 ? (
							<div className="state empty">
								<h2>No commits here</h2>
								{selected ? (
									<>
										<p>
											No {statusWord ? `${statusWord} ` : ""}commits in{" "}
											<strong>#{selected.name}</strong>.
										</p>
										<button
											className="ghost"
											onClick={() => {
												setFilter("all");
												setBranch(null);
											}}
										>
											Clear the filter
										</button>
									</>
								) : (
									<p>{emptyHint}</p>
								)}
							</div>
						) : (
							<div className="rows">
								{visible.map((bookmark) => (
									<BookmarkRow key={bookmark.id} bookmark={bookmark} />
								))}
							</div>
						)}
					</main>
				</div>
			</div>

			<nav className="mobile-tabs" aria-label="Filters">
				{TABS.map(({ id, label: name, icon: Icon }) => (
					<button
						key={id}
						className={!branch && filter === id ? "act" : undefined}
						onClick={() => {
							setBranch(null);
							setFilter(id);
						}}
					>
						<Icon size={18} />
						<span>{name}</span>
					</button>
				))}
			</nav>

			<button
				className="mobile-commit"
				title="New commit"
				aria-label="New commit"
				onClick={() => openAdd()}
			>
				<Plus size={20} />
			</button>

			<SearchBox />

			{dialog && <BookmarkDialog key={dialogKey} />}
			{branchDialog && (
				<BranchDialog
					key={`${branchDialog.mode}-${
						branchDialog.mode === "create"
							? (branchDialog.parentId ?? "root")
							: branchDialog.id
					}`}
				/>
			)}

			{toast && (
				<button className="toast" onClick={clearToast} key={toast.id}>
					{toast.message}
				</button>
			)}
		</div>
	);
}
