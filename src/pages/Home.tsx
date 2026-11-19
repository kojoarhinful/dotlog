import { useEffect, type CSSProperties } from "react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { BRAND } from "../lib/brand";
import "../home.css";

const folders = [
	{
		icon: "i-commit",
		label: "commit folder",
		back: "#EFC93A",
		front: "#FFE45C",
		rotate: -8,
		name: "commit",
		copy: "one paste, one commit.",
	},
	{
		icon: "i-remote",
		label: "remote folder",
		back: "#5BB4E8",
		front: "#8FDCFF",
		rotate: 7,
		name: "remote",
		copy: "the URL you paste in.",
	},
	{
		icon: "i-fetch",
		label: "fetch folder",
		back: "#E070E0",
		front: "#FF9BFF",
		rotate: -6,
		name: "fetch",
		copy: "pulls the title and icon.",
	},
	{
		icon: "i-branch",
		label: "branch folder",
		back: "#4FD08A",
		front: "#7EE6A8",
		rotate: 6,
		name: "branch",
		copy: "a named home for commits.",
	},
	{
		icon: "i-amend",
		label: "amend folder",
		back: "#EE6A32",
		front: "#FF8A52",
		rotate: -7,
		name: "amend",
		copy: "edit a commit.",
	},
	{
		icon: "i-stash",
		label: "stash folder",
		back: "#5F86F0",
		front: "#7BA0FF",
		rotate: 8,
		name: "stash",
		copy: "set a commit aside.",
	},
];

export function Home() {
	useEffect(() => {
		const previous = document.title;
		document.title = `${BRAND}: treat your bookmarks like source code`;
		return () => {
			document.title = previous;
		};
	}, []);

	return (
		<div className="home-page">
			<div className="home">
				<svg
					width="0"
					height="0"
					style={{ position: "absolute" }}
					aria-hidden="true"
				>
					<defs>
						<symbol id="fb" viewBox="0 0 240 210">
							<ellipse
								cx="120"
								cy="203"
								rx="104"
								ry="5"
								fill="#000"
								opacity=".28"
							/>
							<path
								d="M12 62a16 16 0 0 1 16-16h56a14 14 0 0 1 11 5l10 12h107a16 16 0 0 1 16 16V184a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16Z"
								fill="var(--back)"
							/>
							<rect
								x="38"
								y="30"
								width="166"
								height="104"
								rx="8"
								fill="#EDE3CE"
								transform="rotate(3 120 90)"
							/>
							<rect
								x="34"
								y="34"
								width="170"
								height="104"
								rx="8"
								fill="#FFF8EC"
								transform="rotate(-3 120 90)"
							/>
						</symbol>
						<symbol id="ff" viewBox="0 0 240 210">
							<path
								d="M12 96a16 16 0 0 1 16-16h184a16 16 0 0 1 16 16V184a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16Z"
								fill="var(--front)"
							/>
							<path
								d="M28 80h184a16 16 0 0 1 16 16v4H12v-4a16 16 0 0 1 16-16Z"
								fill="#fff"
								opacity=".3"
							/>
							<path
								d="M12 168h216v16a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16Z"
								fill="#000"
								opacity=".1"
							/>
							<rect
								x="28"
								y="176"
								width="44"
								height="6"
								rx="3"
								fill="#fff"
								opacity=".4"
							/>
						</symbol>

						<g id="s-commit">
							<path d="M17 6h30v52l-15-12-15 12z" />
						</g>
						<symbol id="i-commit" viewBox="0 0 64 64">
							<use
								href="#s-commit"
								fill="#FFF8EC"
								stroke="#FFF8EC"
								strokeWidth="10"
								strokeLinejoin="round"
							/>
							<use
								href="#s-commit"
								fill="#FFD23F"
								stroke="#1B1B1B"
								strokeWidth="3"
								strokeLinejoin="round"
							/>
							<path
								d="M32 31v10"
								stroke="#1B1B1B"
								strokeWidth="3"
								strokeLinecap="round"
							/>
							<circle cx="32" cy="25" r="6" fill="#1B1B1B" />
							<circle cx="32" cy="25" r="2.4" fill="#FFD23F" />
						</symbol>

						<g id="s-remote">
							<circle cx="32" cy="32" r="24" />
						</g>
						<symbol id="i-remote" viewBox="0 0 64 64">
							<use
								href="#s-remote"
								fill="#FFF8EC"
								stroke="#FFF8EC"
								strokeWidth="10"
							/>
							<use
								href="#s-remote"
								fill="#3D8BFF"
								stroke="#1B1B1B"
								strokeWidth="3"
							/>
							<g
								fill="none"
								stroke="#fff"
								strokeWidth="2.6"
								strokeLinecap="round"
							>
								<ellipse cx="32" cy="32" rx="10" ry="24" />
								<path d="M9 25h46M9 39h46M32 8v48" />
							</g>
							<path
								d="M17 18a20 20 0 0 1 10-8"
								fill="none"
								stroke="#fff"
								strokeWidth="3"
								strokeLinecap="round"
								opacity=".6"
							/>
						</symbol>

						<g id="s-fetch">
							<path d="M18 44a11 11 0 0 1-1-22 15 15 0 0 1 29 3 10 10 0 0 1-1 19z" />
						</g>
						<symbol id="i-fetch" viewBox="0 0 64 64">
							<g transform="translate(0 8)">
								<use
									href="#s-fetch"
									fill="#FFF8EC"
									stroke="#FFF8EC"
									strokeWidth="10"
									strokeLinejoin="round"
								/>
								<use
									href="#s-fetch"
									fill="#FF8AC2"
									stroke="#1B1B1B"
									strokeWidth="3"
									strokeLinejoin="round"
								/>
								<path
									d="M31 16v19M23 28l8 8 8-8"
									fill="none"
									stroke="#fff"
									strokeWidth="5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</g>
						</symbol>

						<g id="s-branch">
							<path d="M20 12v40" fill="none" />
							<path d="M20 40c0-14 24-6 24-22" fill="none" />
							<circle cx="20" cy="12" r="6.5" />
							<circle cx="20" cy="52" r="6.5" />
							<circle cx="44" cy="16" r="6.5" />
						</g>
						<symbol id="i-branch" viewBox="0 0 64 64">
							<use
								href="#s-branch"
								fill="#FFF8EC"
								stroke="#FFF8EC"
								strokeWidth="12"
								strokeLinecap="round"
							/>
							<g fill="none" strokeLinecap="round">
								<path
									d="M20 12v40M20 40c0-14 24-6 24-22"
									stroke="#1B1B1B"
									strokeWidth="9"
								/>
								<path
									d="M20 12v40M20 40c0-14 24-6 24-22"
									stroke="#7EE6A8"
									strokeWidth="4.5"
								/>
							</g>
							<g fill="#FFD23F" stroke="#1B1B1B" strokeWidth="3">
								<circle cx="20" cy="12" r="6.5" />
								<circle cx="20" cy="52" r="6.5" />
								<circle cx="44" cy="16" r="6.5" />
							</g>
						</symbol>

						<symbol id="i-amend" viewBox="0 0 64 64">
							<g transform="rotate(-40 32 32)">
								<path
									d="M3 25h42l15 7-15 7H3z"
									fill="#FFF8EC"
									stroke="#FFF8EC"
									strokeWidth="10"
									strokeLinejoin="round"
								/>
								<rect
									x="12"
									y="25"
									width="32"
									height="14"
									fill="#FFC531"
									stroke="#1B1B1B"
									strokeWidth="3"
								/>
								<path
									d="M44 25l16 7-16 7z"
									fill="#F7DDB0"
									stroke="#1B1B1B"
									strokeWidth="3"
									strokeLinejoin="round"
								/>
								<path d="M55 29.5l5 2.5-5 2.5z" fill="#1B1B1B" />
								<rect
									x="8"
									y="25"
									width="6"
									height="14"
									fill="#C8CCD6"
									stroke="#1B1B1B"
									strokeWidth="3"
								/>
								<rect
									x="2"
									y="25"
									width="8"
									height="14"
									rx="3"
									fill="#FF8AC2"
									stroke="#1B1B1B"
									strokeWidth="3"
								/>
								<path
									d="M18 29.5h22"
									stroke="#fff"
									opacity=".65"
									strokeWidth="2.4"
									strokeLinecap="round"
								/>
							</g>
						</symbol>

						<g id="s-stash">
							<path d="M15 22h34l-3 32a5 5 0 0 1-5 4.5H23a5 5 0 0 1-5-4.5z" />
							<rect x="11" y="14" width="42" height="8" rx="3" />
							<rect x="25" y="7" width="14" height="8" rx="3" />
						</g>
						<symbol id="i-stash" viewBox="0 0 64 64">
							<use
								href="#s-stash"
								fill="#FFF8EC"
								stroke="#FFF8EC"
								strokeWidth="10"
								strokeLinejoin="round"
							/>
							<use
								href="#s-stash"
								fill="#7BA0FF"
								stroke="#1B1B1B"
								strokeWidth="3"
								strokeLinejoin="round"
							/>
							<path
								d="M26 29v22M32 29v22M38 29v22"
								stroke="#fff"
								strokeWidth="3"
								strokeLinecap="round"
								opacity=".85"
							/>
						</symbol>
					</defs>
				</svg>

				<header className="px-6 pt-6">
					<div className="flex items-center justify-center gap-1">
						<Logo className="h-6 w-6" />
						<span className="font-round font-medium tracking-tight text-xl">
							{BRAND}
						</span>
					</div>
				</header>

				<section className="hero min-h-[86vh] flex flex-col items-center justify-center text-center px-6 pt-20 pb-24">
					<h1 className="font-jakarta font-extrabold logo tracking-tight leading-[1.02] max-w-4xl text-[clamp(2.2rem,5.5vw,4.25rem)]">
						Treat your bookmarks
						<br />
						like source code.
					</h1>
					<p className="mt-4 font-mono text-base sm:text-lg text-dim">
						A Git-inspired way to manage bookmarks.
					</p>
					<Link
						to="/log"
						className="mt-5 inline-block bg-[#3D6CD6] text-white px-6 py-2 text-sm font-mono font-semibold rounded-lg"
					>
						Get started
					</Link>
				</section>

				<section className="words max-w-5xl mx-auto px-6 pt-8 pb-32">
					<p className="intro font-mono text-base sm:text-lg text-paper/80 max-w-2xl leading-relaxed">
						The UI borrows git's words on purpose. Nothing is really version
						controlled, it just feels better than "add bookmark".
					</p>

					<div className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-14">
						{folders.map((folder) => (
							<div key={folder.name} className="text-center">
								<svg
									viewBox="0 0 240 210"
									className="w-full max-w-[230px] mx-auto"
									style={
										{
											"--back": folder.back,
											"--front": folder.front,
										} as CSSProperties
									}
									role="img"
									aria-label={folder.label}
								>
									<use href="#fb" />
									<g
										className="tile-shadow"
										transform={`translate(120 56) rotate(${folder.rotate})`}
									>
										<use
											href={`#${folder.icon}`}
											x="-46"
											y="-46"
											width="92"
											height="92"
										/>
									</g>
									<use href="#ff" />
								</svg>
								<h3 className="-mt-2 font-semibold text-xl">{folder.name}</h3>
								<p className="mt-1 font-mono text-xs text-dim max-w-[15rem] mx-auto leading-relaxed">
									{folder.copy}
								</p>
							</div>
						))}
					</div>
				</section>

				<footer className="px-6 pb-10">
					<div className="max-w-xl mx-auto border-t-2 border-dashed border-white/20 pt-8 text-center font-mono text-xs">
						<p className="text-paper/80">
							built by{" "}
							<a
								href="https://github.com/kojoarhinful"
								target="_blank"
								rel="noopener"
								className="underline underline-offset-4 decoration-dashed hover:text-paper"
							>
								@kojoarhinful
							</a>{" "}
							&amp;{" "}
							<a
								href="https://github.com/rasmusyartey"
								target="_blank"
								rel="noopener"
								className="underline underline-offset-4 decoration-dashed hover:text-paper"
							>
								@rasmusyartey
							</a>
						</p>
						<p className="mt-2 text-paper/40">
							<a
								href="https://github.com/kojoarhinful/dotlog"
								target="_blank"
								rel="noopener"
								className="underline underline-offset-4 decoration-dashed hover:text-paper"
							>
								open source
							</a>
							. &copy; 2026 {BRAND}. All rights reserved. Read on{" "}
							<Link
								to="/terms"
								className="underline underline-offset-4 decoration-dashed hover:text-paper"
							>
								Terms
							</Link>
						</p>
					</div>
				</footer>
			</div>
		</div>
	);
}
