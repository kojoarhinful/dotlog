import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { post } from "../lib/api";
import { readGuestSeed } from "../lib/avatar";
import { useAuth } from "../lib/auth";
import { BRAND } from "../lib/brand";
import { messageOf } from "../lib/errors";

export function Login() {
	const { user, loading, refresh, beginLogin, unlock } = useAuth();
	const navigate = useNavigate();

	const [seed] = useState(readGuestSeed);
	const [step, setStep] = useState<"password" | "code">("password");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [challengeId, setChallengeId] = useState("");
	const [masked, setMasked] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	if (loading) return <Boot />;
	if (user) return <Navigate to="/log" replace />;

	const submitPassword = async () => {
		setBusy(true);
		setError("");
		try {
			const data = await beginLogin(email, password);
			setChallengeId(data.challengeId);
			setMasked(data.email);
			setCode("");
			setStep("code");
		} catch (problem) {
			setError(
				messageOf(problem, "Could not sign in."),
			);
		} finally {
			setBusy(false);
		}
	};

	const submitCode = async () => {
		setBusy(true);
		setError("");
		try {
			await post("/api/auth/login/verify", { challengeId, code });
			await unlock(password);
			setPassword("");
			await refresh();
			navigate("/log", { replace: true });
		} catch (problem) {
			setError(
				messageOf(problem, "Could not sign in."),
			);
			setBusy(false);
		}
	};

	return (
		<div className="auth">
			<div className="auth-panel">
				<Avatar className="auth-avatar" size={64} seed={seed} />

				<h1 className="auth-handle">{BRAND}</h1>
				<p className="auth-tagline">
					{step === "password"
						? "Sign in to your log."
						: `We sent a code to ${masked}.`}
				</p>

				{step === "password" ? (
					<form
						className="auth-form"
						onSubmit={(event) => {
							event.preventDefault();
							void submitPassword();
						}}
					>
						<div className="auth-field">
							<input
								type="email"
								value={email}
								autoComplete="email"
								autoFocus
								aria-label="Email"
								placeholder="email"
								onChange={(event) => {
									setEmail(event.target.value);
									setError("");
								}}
							/>
						</div>
						<div className="auth-field">
							<input
								type="password"
								value={password}
								autoComplete="current-password"
								aria-label="Password"
								placeholder="password"
								onChange={(event) => {
									setPassword(event.target.value);
									setError("");
								}}
							/>
						</div>

						<button
							className="primary auth-submit"
							type="submit"
							disabled={busy}
						>
							{busy ? <Loader2 size={15} className="spin" /> : null}
							Continue
						</button>
					</form>
				) : (
					<form
						className="auth-form"
						onSubmit={(event) => {
							event.preventDefault();
							void submitCode();
						}}
					>
						<div className="auth-field">
							<input
								value={code}
								inputMode="numeric"
								autoComplete="one-time-code"
								autoFocus
								maxLength={6}
								aria-label="Sign in code"
								placeholder="6 digit code"
								onChange={(event) => {
									setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
									setError("");
								}}
							/>
						</div>

						<button
							className="primary auth-submit"
							type="submit"
							disabled={busy || code.length !== 6}
						>
							{busy ? <Loader2 size={15} className="spin" /> : null}
							Open my log
						</button>

						<button
							type="button"
							className="auth-alt"
							onClick={() => {
								setStep("password");
								setCode("");
								setChallengeId("");
								setError("");
							}}
						>
							<ArrowLeft size={13} />
							Use a different email
						</button>
					</form>
				)}

				{error && <p className="field-error auth-error">{error}</p>}

				{step === "password" && (
					<div className="auth-links">
						<Link to="/signup">Create an account</Link>
						<Link to="/recover">Forgot your password?</Link>
					</div>
				)}
			</div>
		</div>
	);
}

export function Boot() {
	return (
		<div className="boot">
			<span className="spin-ring" />
			<p>Opening the log...</p>
		</div>
	);
}
