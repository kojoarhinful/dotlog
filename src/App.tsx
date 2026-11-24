import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	Archive,
	Bookmark as BookmarkIcon,
	CheckCircle2,
	Circle,
	Menu,
	Plus,
	RefreshCw,
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
import { useIconRefresh } from "./hooks/useIconRefresh";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useScrollLock } from "./hooks/useScrollLock";
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

const COPY: Record<Filter, { status: string; empty: string }> = {
	all: { status: "", empty: "Your commits show up here." },
	unread: {
		status: "unreviewed",
		empty: "Commits you have not reviewed yet show up here.",
	},
	read: {
		status: "reviewed",
		empty: "Mark a commit as reviewed and it shows up here.",
	},
	stashed: { status: "stashed", empty: "Commits you stash show up here." },
};

export function App({ user }: { user: AuthUser }) {
	const {
		ready,
		bookmarks,
		branches,
		filter,
		branch,
		searchOpen,
		dialog,
		branchDialog,
		toast,
	} = useStore(
		useShallow((s) => ({
			ready: s.ready,
			bookmarks: s.bookmarks,
			branches: s.branches,
			filter: s.filter,
			branch: s.branch,
			searchOpen: s.searchOpen,
			dialog: s.dialog,
			branchDialog: s.branchDialog,
			toast: s.toast,
		})),
	);

	const {
		load,
		reset,
		sync,
		setFilter,
		setBranch,
		openAdd,
		openSearch,
		clearToast,
	} = useStore(
		useShallow((s) => ({
			load: s.load,
			reset: s.reset,
			sync: s.sync,
			setFilter: s.setFilter,
			setBranch: s.setBranch,
			openAdd: s.openAdd,
			openSearch: s.openSearch,
			clearToast: s.clearToast,
		})),
	);

	const lastRow = useRef<string | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const icons = useIconRefresh(user.id);

	useKeyboardShortcuts();
	useScrollLock(!!dialog || !!branchDialog || searchOpen || menuOpen);

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

	const label = TABS.find((tab) => tab.id === filter)?.label ?? "";
	const { status: statusWord, empty: emptyHint } = COPY[filter];

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
							type="button"
							className="ghost small refresh-icons"
							disabled={!ready || (!icons.refreshing && bookmarks.length === 0)}
							aria-label={
								icons.refreshing
									? `Stop refetching icons, ${icons.done} of ${icons.total}`
									: "Refetch icons"
							}
							title={
								icons.refreshing
									? "Stop refetching icons"
									: "Refetch every commit's icon"
							}
							onClick={() => {
								if (icons.refreshing) icons.stop();
								else void icons.start();
							}}
						>
							{icons.refreshing ? <X size={13} /> : <RefreshCw size={13} />}
							<span>
								{icons.refreshing
									? `Stop ${icons.done}/${icons.total}`
									: "Refetch icons"}
							</span>
						</button>
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

			<div className="mobile-dock">
				<nav className="mobile-tabs" aria-label="Filters">
					{TABS.map(({ id, label: name, icon: Icon }) => {
						const active = !branch && filter === id;
						const count = counts[id];
						return (
							<button
								key={id}
								className={active ? "act" : undefined}
								aria-current={active ? "page" : undefined}
								onClick={() => {
									setBranch(null);
									setFilter(id);
								}}
							>
								<span className="tab-icon">
									<Icon size={20} />
									{count > 0 && <span className="tab-count">{count}</span>}
								</span>
								<span className="tab-label">{name}</span>
							</button>
						);
					})}
				</nav>
				<button
					className="dock-search"
					aria-label="Search commits"
					title="Search commits"
					onClick={openSearch}
				>
					<SearchIcon size={20} />
				</button>
			</div>

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
