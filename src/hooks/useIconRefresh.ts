import { useCallback, useEffect, useRef, useState } from "react";
import { shrinkIcon } from "../lib/icon";
import { readLink } from "../lib/metadata";
import { useStore } from "../lib/store";

// Progress is optional, so storage errors are ignored.
function getProgress(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function saveProgress(key: string, id: string) {
	try {
		window.localStorage.setItem(key, id);
	} catch {}
}

function clearProgress(key: string) {
	try {
		window.localStorage.removeItem(key);
	} catch {}
}

// Re-reads each commit's link and updates its favicon, resuming where the last run stopped.
export function useIconRefresh(userId: string) {
	const [refreshing, setRefreshing] = useState(false);
	const [done, setDone] = useState(0);
	const [total, setTotal] = useState(0);
	const stopRequested = useRef(false);

	// Signing out unmounts the page; leave no refresh running in the background.
	useEffect(
		() => () => {
			stopRequested.current = true;
		},
		[],
	);

	const stop = useCallback(() => {
		stopRequested.current = true;
	}, []);

	const start = useCallback(async () => {
		if (refreshing) return;

		const { bookmarks, notify } = useStore.getState();
		const targets = bookmarks.filter((item) => !!item.url);
		if (targets.length === 0) {
			notify("No commits to refresh yet.");
			return;
		}

		const cursorKey = `refs:icon-cursor:${userId}`;
		const saved = getProgress(cursorKey);
		const next = saved ? targets.findIndex((item) => item.id === saved) + 1 : 0;
		const from = next >= targets.length ? 0 : next;
		const queue = from > 0 ? targets.slice(from) : targets;

		stopRequested.current = false;
		setRefreshing(true);
		setDone(0);
		setTotal(queue.length);

		let changed = 0;
		let failed = 0;
		let stopped = false;

		try {
			for (const [index, item] of queue.entries()) {
				if (stopRequested.current) {
					stopped = true;
					break;
				}

				const current = useStore
					.getState()
					.bookmarks.find((entry) => entry.id === item.id);
				if (!current) {
					saveProgress(cursorKey, item.id);
					setDone(index + 1);
					continue;
				}

				const url = current.url;

				try {
					const data = await readLink(url);

					if (stopRequested.current) {
						stopped = true;
						break;
					}

					const icon = data.favicon ? await shrinkIcon(data.favicon) : "";

					const fresh = useStore
						.getState()
						.bookmarks.find((entry) => entry.id === item.id);
					if (fresh && fresh.url === url && icon && icon !== fresh.favicon) {
						await useStore.getState().update(item.id, { favicon: icon });
						changed += 1;
					}
				} catch (problem) {
					const message = problem instanceof Error ? problem.message : "";
					if (message.startsWith("Too many links")) {
						stopped = true;
						break;
					}
					failed += 1;
				}

				saveProgress(cursorKey, item.id);
				setDone(index + 1);

				// One at a time keeps the server and the sites happy.
				await new Promise((resolve) => window.setTimeout(resolve, 150));
			}
		} finally {
			setRefreshing(false);
		}

		if (stopped) {
			notify(
				stopRequested.current
					? `Stopped. ${changed} icons refreshed.`
					: `Link limit reached. ${changed} icons refreshed, try again later.`,
			);
			return;
		}

		clearProgress(cursorKey);

		if (failed > 0) {
			notify(`${changed} icons refreshed, ${failed} could not be read.`);
		} else if (changed === 0) {
			notify("All icons are already up to date.");
		} else {
			notify(`${changed} icons refreshed.`);
		}
	}, [refreshing, userId]);

	return { refreshing, done, total, start, stop };
}
