import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/LegalShell";
import { ISSUES_URL, CONTACT_EMAIL } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — FocusSpace",
  description: "How FocusSpace handles your data. Short version: it's yours, and we don't look at it.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 15, 2026">
      <p>
        FocusSpace is a focus and productivity app. This policy explains, in plain language, what
        data the app stores and what we do with it. The short version: <strong>your data is yours</strong>,
        we use it only to run the app for you, and we don&apos;t sell it, mine it, or look through it.
      </p>

      <h2>What we store</h2>
      <p>To make the app work, we store the things you create and the settings you choose:</p>
      <ul>
        <li><strong>Account</strong> — your email address (via your chosen sign-in method) so you can log in.</li>
        <li><strong>Your content</strong> — your projects, tasks, subtasks, tags, notes, and focus-session history.</li>
        <li><strong>Preferences</strong> — theme, wallpaper, timer settings, and other app options.</li>
        <li><strong>AI conversations</strong> — if you use Focus AI, your chats and the actions it takes.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use your data for one purpose only: <strong>to operate FocusSpace for you</strong> — saving
        your work, running your timer, and showing <strong>you</strong> your own analytics. We do not use
        your data for advertising, profiling, or training AI models, and we never sell or rent it to anyone.
      </p>

      <h2>Your AI chats are private</h2>
      <p>
        Focus AI is optional and off by default. When you use it, your conversations and the changes it
        makes are stored in <strong>your own database rows</strong>, protected by row-level security so only
        your account can read them. <strong>We never read, access, or use your AI chats</strong> for any
        purpose. Your messages are sent to the AI model provider you (or the deployment) configured, solely
        to generate a response — nothing more. If you bring your own API key, it is encrypted at rest and
        never returned to your browser.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Data is stored in <strong>Supabase</strong> (Postgres + storage), with row-level security scoping
        every record to its owner. Optional integrations only run if you turn them on:
      </p>
      <ul>
        <li><strong>Spotify</strong> — only if you connect it, to control playback during sessions.</li>
        <li><strong>AI model provider</strong> — only if AI is enabled, to generate assistant replies.</li>
      </ul>

      <h2>Your control</h2>
      <p>
        You can edit or delete your projects, tasks, sessions, and AI conversations at any time inside the
        app. Deleting your account removes your associated data. Because FocusSpace is open source, you can
        also self-host your own instance and keep everything on infrastructure you control.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes, the &quot;last updated&quot; date above will change with it. Material changes
        will be reflected in the repository&apos;s history, which is public.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or concerns? Open an issue on{" "}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">GitHub</a> or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
