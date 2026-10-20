// Guest authentication and legal presentation screens.
import { useEffect, useRef, useState } from "react";
import AuthConfirmationPanel from "../AuthConfirmationPanel";
import privacyPolicyMarkdown from "../legal/privacy-policy.md?raw";
import termsOfServiceMarkdown from "../legal/terms-of-service.md?raw";
import { OFFICIAL_X_URL } from "../lib/appSiteConfig";
import { Panel } from "./Panel";

export function LegalDocumentScreen({ page }) {
  const document =
    page === "privacy"
      ? {
          eyebrow: "privacy",
          markdown: privacyPolicyMarkdown,
          title: "プライバシーポリシー",
        }
      : {
          eyebrow: "terms",
          markdown: termsOfServiceMarkdown,
          title: "利用規約",
        };

  return (
    <main className="mx-auto min-w-0 max-w-3xl pb-10">
      <Panel eyebrow={document.eyebrow} title={document.title}>
        <div className="mb-4 flex flex-wrap gap-2">
          <a
            className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            href="/"
          >
            星空Villageへ戻る
          </a>
          <a
            className="min-h-9 rounded-full border border-comet/20 bg-comet/10 px-3 py-2 text-xs font-black text-comet transition hover:border-comet/35 hover:bg-comet/15 hover:text-white"
            href={page === "privacy" ? "/terms" : "/privacy"}
          >
            {page === "privacy" ? "利用規約を見る" : "プライバシーポリシーを見る"}
          </a>
        </div>
        <MarkdownDocument markdown={document.markdown} />
      </Panel>
    </main>
  );
}

export function MarkdownDocument({ markdown }) {
  const elements = [];
  let paragraphLines = [];
  let listItems = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    const lines = paragraphLines;
    const key = `p-${elements.length}`;

    elements.push(
      <p className="text-sm leading-7 text-slate-300" key={key}>
        {lines.map((line, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 && <br />}
            {line}
          </span>
        ))}
      </p>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const key = `ul-${elements.length}`;

    elements.push(
      <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-slate-300" key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const rawLine of String(markdown ?? "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      elements.push(<hr className="border-white/10" key={`hr-${elements.length}`} />);
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];

      if (level === 1) {
        elements.push(
          <h1 className="text-xl font-black leading-8 text-white" key={`h1-${elements.length}`}>
            {headingText}
          </h1>,
        );
      } else if (level === 2) {
        elements.push(
          <h2 className="pt-2 text-base font-black leading-7 text-white" key={`h2-${elements.length}`}>
            {headingText}
          </h2>,
        );
      } else {
        elements.push(
          <h3 className="text-sm font-black leading-7 text-comet" key={`h3-${elements.length}`}>
            {headingText}
          </h3>,
        );
      }
      continue;
    }

    if (trimmedLine.startsWith("- ")) {
      flushParagraph();
      listItems.push(trimmedLine.slice(2));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="space-y-4">{elements}</div>;
}

export function AuthPanel({ auth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [legalDocument, setLegalDocument] = useState(null);
  const legalDialogRef = useRef(null);
  const legalLinkReturnFocusRef = useRef(null);
  const isSignUp = mode === "signup";
  const userEmail = auth.session?.user?.email;
  const signUpConsentReady = acceptedLegal && confirmedAge;
  const isLegalDialogOpen = Boolean(legalDocument);
  const hasConfirmationState = Boolean(auth.confirmation);

  useEffect(() => {
    if (!isLegalDialogOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setLegalDocument(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    legalDialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      legalLinkReturnFocusRef.current?.focus();
    };
  }, [isLegalDialogOpen]);

  function openLegalDocument(documentType, event) {
    event.preventDefault();
    event.stopPropagation();
    legalLinkReturnFocusRef.current = event.currentTarget;
    setLegalDocument(documentType);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSignUp) {
      await auth.onSignUp(email, password, {
        acceptedLegal,
        confirmedAge,
      });
      return;
    }

    await auth.onLogin(email, password);
  }

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-night-950/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold normal-case text-comet">Supabase Auth</p>
          <p className="mt-1 text-sm font-black text-white">{auth.status}</p>
        </div>
        <span className={`h-2 w-2 rounded-full ${auth.session ? "bg-comet" : "bg-slate-500"}`} />
      </div>

      {hasConfirmationState ? (
        <AuthConfirmationPanel
          confirmation={auth.confirmation}
          error={auth.error}
          loading={auth.loading}
          message={auth.message}
          onBack={auth.onCloseConfirmation}
          onContinue={auth.onCloseConfirmation}
          onResend={auth.onResendConfirmation}
        />
      ) : auth.session ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-slate-300">
            {userEmail ? `${userEmail} でログイン中` : "ログイン中"}
          </p>
          <button
            className="min-h-10 w-full rounded-2xl border border-sakura/30 bg-sakura/10 px-4 text-xs font-black text-sakura transition hover:bg-sakura/15 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading}
            onClick={auth.onLogout}
            type="button"
          >
            {auth.loading ? "処理中..." : "ログアウト"}
          </button>
        </div>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1">
  <button
    aria-label="村へ帰る（ログイン）"
    className={`relative min-h-12 rounded-xl px-3 pb-4 pt-2 text-xs font-black transition ${
      mode === "login"
        ? "bg-comet/20 text-comet shadow-[0_0_18px_rgba(103,232,249,0.12)]"
        : "text-comet/75 hover:bg-comet/10 hover:text-comet"
    }`}
    onClick={() => setMode("login")}
    type="button"
  >
    <span className="block text-[13px] leading-5">村へ帰る</span>
    <span aria-hidden="true" className="absolute bottom-1 right-2 text-[9px] font-bold text-white/85">
      （ログイン）
    </span>
  </button>
  <button
    aria-label="入村手続き（会員登録）"
    className={`relative min-h-12 rounded-xl px-3 pb-4 pt-2 text-xs font-black transition ${
      mode === "signup"
        ? "bg-gradient-to-r from-aurora/20 to-sakura/20 text-sakura shadow-[0_0_18px_rgba(244,114,182,0.14)]"
        : "text-sakura/75 hover:bg-sakura/10 hover:text-sakura"
    }`}
    onClick={() => setMode("signup")}
    type="button"
  >
    <span className="block text-[13px] leading-5">入村手続き</span>
    <span aria-hidden="true" className="absolute bottom-1 right-2 text-[9px] font-bold text-white/85">
      （会員登録）
    </span>
  </button>
</div>

          <label className="block text-xs font-bold text-slate-400">
            メールアドレス
            <input
              autoComplete="email"
              className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block text-xs font-bold text-slate-400">
            パスワード
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="mt-1 min-h-10 w-full rounded-2xl border border-white/10 bg-night-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-comet/40 focus:ring-4 focus:ring-comet/10"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6文字以上"
              required
              type="password"
              value={password}
            />
          </label>

          {!isSignUp ? (
            <button
              className="min-h-9 w-full text-right text-xs font-black text-comet transition hover:text-aurora"
              onClick={() => auth.onOpenPasswordRecovery(email)}
              type="button"
            >
              パスワードを忘れた方
            </button>
          ) : null}

          {isSignUp && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs leading-5 text-slate-300">
              <div className="flex items-start gap-3">
                <input
                  aria-label="利用規約とプライバシーポリシーに同意する"
                  checked={acceptedLegal}
                  className="mt-1 h-5 w-5 rounded border-white/20 bg-night-950 text-comet focus:ring-comet/30"
                  onChange={(event) => setAcceptedLegal(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <button
                    className="font-black text-comet underline-offset-4 hover:underline"
                    onClick={(event) => openLegalDocument("terms", event)}
                    type="button"
                  >
                    利用規約
                  </button>
                  <span>と</span>
                  <button
                    className="font-black text-comet underline-offset-4 hover:underline"
                    onClick={(event) => openLegalDocument("privacy", event)}
                    type="button"
                  >
                    プライバシーポリシー
                  </button>
                  <span>を確認し、同意します</span>
                </span>
              </div>
              <label className="flex items-start gap-3">
                <input
                  checked={confirmedAge}
                  className="mt-1 h-5 w-5 rounded border-white/20 bg-night-950 text-comet focus:ring-comet/30"
                  onChange={(event) => setConfirmedAge(event.target.checked)}
                  type="checkbox"
                />
                <span>私は18歳以上であることを確認します</span>
              </label>
            </div>
          )}

          <button
            className="min-h-10 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-xs font-black text-night-950 shadow-glow transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={auth.loading || (isSignUp && !signUpConsentReady)}
            type="submit"
          >
            {auth.loading ? "処理中..." : isSignUp ? "入村する" : "村へ帰る"}
          </button>
        </form>
      )}

      {!hasConfirmationState && (auth.message || auth.error) && (
        <p
          className={`mt-3 rounded-2xl border px-3 py-2 text-xs leading-5 ${
            auth.error ? "border-sakura/30 bg-sakura/10 text-sakura" : "border-comet/20 bg-comet/10 text-comet"
          }`}
        >
          {auth.error || auth.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
        <a className="transition hover:text-comet" href="/terms">利用規約</a>
        <a className="transition hover:text-comet" href="/privacy">プライバシーポリシー</a>
        <a className="transition hover:text-comet" href={OFFICIAL_X_URL} rel="noopener noreferrer" target="_blank">公式X</a>
        <a className="transition hover:text-comet" href="mailto:akaibuhoshizora@gmail.com">メール</a>
      </div>

      {legalDocument && (
        <LegalDocumentModal
          documentType={legalDocument}
          dialogRef={legalDialogRef}
          onClose={() => setLegalDocument(null)}
          onSelectDocument={setLegalDocument}
        />
      )}
    </section>
  );
}

export function LegalDocumentModal({ documentType, dialogRef, onClose, onSelectDocument }) {
  const document =
    documentType === "privacy"
      ? {
          markdown: privacyPolicyMarkdown,
          title: "プライバシーポリシー",
        }
      : {
          markdown: termsOfServiceMarkdown,
          title: "利用規約",
        };
  const titleId = "signup-legal-document-title";

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-night-950/90 px-3 py-4 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-night-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-night-950 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-bold normal-case text-comet">legal</p>
            <h2 className="mt-1 text-base font-black text-white" id={titleId}>
              {document.title}
            </h2>
          </div>
          <button
            aria-label="法務文書を閉じる"
            className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-300 transition hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <button
            aria-pressed={documentType === "terms"}
            className={`min-h-9 rounded-full border px-3 py-2 text-xs font-black transition ${
              documentType === "terms"
                ? "border-comet/35 bg-comet/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            }`}
            onClick={() => onSelectDocument("terms")}
            type="button"
          >
            利用規約
          </button>
          <button
            aria-pressed={documentType === "privacy"}
            className={`min-h-9 rounded-full border px-3 py-2 text-xs font-black transition ${
              documentType === "privacy"
                ? "border-comet/35 bg-comet/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-comet/30 hover:bg-comet/10 hover:text-white"
            }`}
            onClick={() => onSelectDocument("privacy")}
            type="button"
          >
            プライバシーポリシー
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
          <MarkdownDocument markdown={document.markdown} />
          <button
            className="mt-8 min-h-12 w-full rounded-2xl bg-gradient-to-r from-comet via-aurora to-sakura px-4 text-sm font-black text-night-950 shadow-glow transition hover:scale-[1.01]"
            onClick={onClose}
            type="button"
          >
            確認して会員登録に戻る
          </button>
        </div>
      </section>
    </div>
  );
}
