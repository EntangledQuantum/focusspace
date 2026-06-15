import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/LegalShell";
import { ISSUES_URL, CONTACT_EMAIL } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Service — FocusSpace",
  description: "The terms for using FocusSpace, the open-source focus & productivity app.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="June 15, 2026">
      <p>
        Welcome to FocusSpace. By using the app you agree to these terms. They&apos;re intentionally simple:
        FocusSpace is a free, open-source tool provided to help you focus, and your data stays yours.
      </p>

      <h2>Using FocusSpace</h2>
      <p>
        You may use FocusSpace for personal productivity. You&apos;re responsible for your account and for
        keeping your sign-in method secure. Don&apos;t use the service to break the law, abuse the
        infrastructure, or harm other people.
      </p>

      <h2>Your content is yours</h2>
      <p>
        You own everything you create — your projects, tasks, notes, focus history, and AI conversations.
        We claim no ownership over your content and use it only to provide the app to you, as described in
        our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>AI features</h2>
      <p>
        Focus AI is optional and can be turned off at any time in Settings. It can add, edit, and delete
        tasks on your behalf when you ask it to, so review its actions. AI output may be inaccurate or
        incomplete — treat it as an assistant, not an authority. Your AI conversations are private to your
        account and are never read or reused by us.
      </p>

      <h2>Third-party services</h2>
      <p>
        Optional integrations (such as Spotify and your configured AI model provider) are governed by their
        own terms and privacy policies. They only run when you enable them.
      </p>

      <h2>No warranty</h2>
      <p>
        FocusSpace is provided <strong>&quot;as is&quot;</strong>, without warranties of any kind. We do our
        best to keep it working, but we can&apos;t guarantee it will always be available, error-free, or fit
        for a particular purpose. To the fullest extent permitted by law, we aren&apos;t liable for any loss
        arising from your use of the app. Keep your own backups of anything important.
      </p>

      <h2>Open source</h2>
      <p>
        FocusSpace is open source. Your use of the source code is governed by the license in the{" "}
        <a href={ISSUES_URL.replace("/issues", "")} target="_blank" rel="noreferrer">GitHub repository</a>.
        You&apos;re welcome to self-host your own instance.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms; the &quot;last updated&quot; date above will reflect any change, and the
        full history is public in the repository.
      </p>

      <h2>Contact</h2>
      <p>
        For any issue, open one on{" "}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">GitHub</a> or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
