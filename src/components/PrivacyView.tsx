import { useEffect } from 'react';
import { Globe } from 'lucide-react';

export function PrivacyView() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacy notice - Domain Expansion';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a className="flex min-h-11 items-center gap-3 rounded-md font-semibold tracking-tight text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" href="/" aria-label="Domain Expansion home">
            <span className="grid size-9 place-items-center rounded-lg bg-indigo-950 text-indigo-300" aria-hidden="true"><Globe className="size-5" /></span>
            <span>Domain Expansion</span>
          </a>
          <nav aria-label="Privacy page navigation" className="flex items-center gap-5 text-sm text-zinc-300">
            <a className="rounded underline decoration-zinc-600 underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" href="/showcase">Showcase</a>
            <a className="rounded bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" href="/">Open app</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Domain Expansion / Privacy</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Privacy notice</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">This notice explains what Domain Expansion handles when you request access or use the domain tracker, AI capture, exports, and optional Google features.</p>
          <p className="mt-4 text-sm text-zinc-500">Last updated: September 29, 2026</p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Account boundary</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Portfolios are isolated by signed-in account inside the application.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Optional features</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">AI and Google features run only when you choose and submit an action.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Plain-text fields</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Payment descriptions are ordinary private record text, not end-to-end encrypted.</p>
          </div>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14">
          <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:sticky lg:top-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">On this page</h2>
            <nav aria-label="Privacy notice contents" className="mt-4 grid gap-3 text-sm text-zinc-300">
              <a className="hover:text-white" href="#information">Information</a>
              <a className="hover:text-white" href="#use">How it is used</a>
              <a className="hover:text-white" href="#providers">Providers and access</a>
              <a className="hover:text-white" href="#ai">AI and Google</a>
              <a className="hover:text-white" href="#retention">Exports and retention</a>
              <a className="hover:text-white" href="#choices">Your choices</a>
            </nav>
          </aside>

          <div className="min-w-0 space-y-12 text-[15px] leading-7 text-zinc-300">
            <section id="information" aria-labelledby="information-title" className="scroll-mt-8">
              <h2 id="information-title" className="text-2xl font-semibold tracking-tight text-white">Information the service handles</h2>
              <div className="mt-5 space-y-5">
                <p><strong className="font-semibold text-zinc-100">Account and access:</strong> Firebase Authentication handles your sign-in email and email-link session. If you request access, the service stores the email you submit and an optional short reason so an administrator can review the request. The app also stores your approval and account role.</p>
                <p><strong className="font-semibold text-zinc-100">Portfolio and settings:</strong> Firestore stores domain records and account settings, including domain names, registrar and DNS provider, ownership and lifecycle, renewal details and costs, currency, notes, reminders, and display preferences. You may optionally save a purchase email and a plain-text payment-method description on a domain. The email is checked for email syntax, not verified by sending a message. The payment description is not parsed or tokenized and is subject to the same account access rules as the rest of the record.</p>
                <p><strong className="font-semibold text-zinc-100">Security and service state:</strong> The service keeps information needed to enforce account access, API token scopes and revocation, provider-key configuration, access-request notifications, and safe retry of interrupted work. It may retain references to Google Calendar events or Tasks created for a domain to avoid duplicate reminders. Personal API tokens are shown when created and are stored as verifiers; Gemini keys supplied through BYOK are encrypted before server-side storage.</p>
              </div>
            </section>

            <section id="use" aria-labelledby="use-title" className="scroll-mt-8 border-t border-zinc-800 pt-10">
              <h2 id="use-title" className="text-2xl font-semibold tracking-tight text-white">How information is used</h2>
              <p className="mt-5">We use account and portfolio information to authenticate approved members, show and update each member's own domains, calculate renewal summaries, run requested integrations, and provide support and abuse protection. Domain records are stored in Firestore. Application servers check the signed-in identity, membership, record ownership, and API token permissions before returning or changing account data.</p>
              <p className="mt-5">Domain Expansion does not sell personal or portfolio information and does not use it for advertising. The application does not use submitted AI text to train its own models. This describes Domain Expansion's use; it is not a promise about retention or model-training practices of external providers.</p>
            </section>

            <section id="providers" aria-labelledby="providers-title" className="scroll-mt-8 border-t border-zinc-800 pt-10">
              <h2 id="providers-title" className="text-2xl font-semibold tracking-tight text-white">Service providers and access</h2>
              <ul className="mt-5 list-disc space-y-3 pl-5 marker:text-indigo-300">
                <li><strong className="font-semibold text-zinc-100">Firebase and Google Cloud</strong> provide sign-in and database services. Vercel hosts the web application and API; Cloudflare routes requests from the public domain to that API. Their infrastructure may process data as needed to run those services.</li>
                <li><strong className="font-semibold text-zinc-100">Resend</strong> is used only for administrator notifications about access requests, which can include the email and reason you submitted. Firebase sends authentication email links; Resend does not send the sign-in link.</li>
                <li><strong className="font-semibold text-zinc-100">Privileged service access:</strong> The app isolates portfolios between accounts, including from ordinary application administrators. The application server and appropriately privileged infrastructure operators can access data needed to operate the service. Records, including payment descriptions, are not end-to-end encrypted or zero-knowledge.</li>
              </ul>
            </section>

            <section id="ai" aria-labelledby="ai-title" className="scroll-mt-8 border-t border-zinc-800 pt-10">
              <h2 id="ai-title" className="text-2xl font-semibold tracking-tight text-white">AI and Google features</h2>
              <div className="mt-5 space-y-5">
                <p><strong className="font-semibold text-zinc-100">AI Quick Add:</strong> This is optional. When you submit text for extraction, that text is sent to Google's Gemini API to return draft domain details for your review. The app does not send your portfolio automatically. You must approve a draft before it becomes a saved domain. Google processes requests under its applicable terms and policies; Domain Expansion does not promise Google's retention or training practices.</p>
                <p>If you provide a Gemini API key, you can grant consent for the service to use it. The key is encrypted for server-side storage, is not returned to the browser after saving, and can be removed from your account. Removing it prevents future requests that depend on it; it cannot recall a request already sent to Google. A specifically configured owner credential may be used only for the designated owner account.</p>
                <p><strong className="font-semibold text-zinc-100">Google integrations:</strong> Calendar event creation, Tasks reminders, Sheets exports, and Drive file backups are optional. When you choose one, the app requests an action-specific Google permission and uses an access token to send information needed for the action: a domain and date for a reminder, a table of your domain records for Sheets, or a backup file you request for Drive. The Sheets table and backup can include optional purchase details. The token authorizes the Google action; it does not sign you into Domain Expansion or change your account identity. The app does not scan Drive automatically, create a second database, or use Google data to train its own AI. You can revoke access in your <a className="text-indigo-300 underline decoration-indigo-500/60 underline-offset-4 hover:text-indigo-200" href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google Account connections</a>.</p>
                <p>Calendar access is limited to events on calendars you own, and the app uses your primary calendar. Tasks access supports creating and finding reminders in your default task list. Sheets and Drive use file-specific access for files created by or explicitly shared with this app. The app reads matching reminder references to reconcile interrupted requests and lists its named Drive backups only when you choose restore. A selected backup is downloaded for an import preview before you choose whether to save it. Google access tokens stay in browser memory for the requested action; they are not stored in the portfolio or on the application server.</p>
                <p>Domain Expansion's use of information received from Google APIs complies with the <a className="text-indigo-300 underline decoration-indigo-500/60 underline-offset-4 hover:text-indigo-200" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements. This information is used only for the Google features you choose, not for advertising, sale, credit decisions, or AI model training. Human access is limited to your affirmative agreement to inspect specific data, necessary security work, or legal obligations. This applies to data obtained through Google account permissions; the separate AI Quick Add section describes text you submit to Gemini.</p>
                <p>Disconnecting Google access or deleting a Domain Expansion record does not automatically remove Calendar events, Tasks, Sheets, or Drive files already created. Manage or delete those items in the relevant Google service. A backup you explicitly create may include the optional purchase email and payment-method description.</p>
              </div>
            </section>

            <section id="retention" aria-labelledby="retention-title" className="scroll-mt-8 border-t border-zinc-800 pt-10">
              <h2 id="retention-title" className="text-2xl font-semibold tracking-tight text-white">Exports, deletion, and retention</h2>
              <div className="mt-5 space-y-5">
                <p>You can export your domain information using the authenticated export tools. User-authorized domain backups include the supported domain fields, including optional purchase details; they exclude account credentials, API token verifiers, provider keys, and access-control records. Some table formats are lossy and are not complete backups.</p>
                <p>Archiving a domain hides it from ordinary active views but keeps its record. A permanent domain delete removes that record from the portfolio; it does not remove external Google items. Records otherwise remain until you delete them or the account is removed.</p>
                <p>There is no self-service full-account deletion control in the app. To ask for account and associated data removal, open an issue on the <a className="text-indigo-300 underline decoration-indigo-500/60 underline-offset-4 hover:text-indigo-200" href="https://github.com/devin-thomas/domain-expansion/issues" target="_blank" rel="noreferrer">canonical GitHub repository</a> requesting private follow-up. GitHub issues may be public: do not post your email address, domains, payment details, credentials, tokens, or other private account information there.</p>
              </div>
            </section>

            <section id="choices" aria-labelledby="choices-title" className="scroll-mt-8 border-t border-zinc-800 pt-10">
              <h2 id="choices-title" className="text-2xl font-semibold tracking-tight text-white">Your choices and contact</h2>
              <p className="mt-5">You can choose whether to use AI or a Google integration, revoke Google access from your Google Account, remove your Gemini key in settings, export your data, and permanently delete individual domain records. Optional features are not required for ordinary manual domain tracking.</p>
              <p className="mt-5">For a privacy question or a private account-removal follow-up, use the canonical <a className="text-indigo-300 underline decoration-indigo-500/60 underline-offset-4 hover:text-indigo-200" href="https://github.com/devin-thomas/domain-expansion/issues" target="_blank" rel="noreferrer">GitHub issues page</a> and ask for a private response. Keep sensitive information out of the public issue itself.</p>
              <p className="mt-5 text-sm text-zinc-500">This notice describes the current product behavior. It is not a statement that third-party providers have any particular retention period or service availability.</p>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-zinc-500 sm:px-8">
          <span>Domain Expansion</span>
          <div className="flex gap-5">
            <a className="hover:text-zinc-200" href="/showcase">Showcase</a>
            <a className="hover:text-zinc-200" href="/">Open app</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
