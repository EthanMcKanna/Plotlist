import { LegalPage } from "../../components/LegalPage";

export default function GuidelinesScreen() {
  return (
    <LegalPage
      title="Community Guidelines"
      updated="July 11, 2026"
      intro="Plotlist is a place to talk about TV with people whose taste you trust. A few rules keep it that way."
      sections={[
        {
          heading: "Be decent",
          paragraphs: [
            "Disagree about shows, not about people. No harassment, hate speech, threats, or targeted abuse — in reviews, comments, list titles, usernames, or anywhere else.",
          ],
        },
        {
          heading: "Keep it real",
          paragraphs: [
            "Don't impersonate other people, post spam, or manipulate follows and likes. One person, one account.",
          ],
        },
        {
          heading: "Keep it legal and safe",
          paragraphs: [
            "No sexually explicit content involving minors, no content that promotes violence or self-harm, and nothing that's illegal where you live. Mark spoilers as spoilers.",
          ],
        },
        {
          heading: "Enforcement",
          paragraphs: [
            "Content and accounts that break these rules get removed. You can report any review, comment, list, watch log, or user from the app — long-press a comment or use the report option on the content — and you can block anyone to stop all contact instantly.",
            "Reports are reviewed promptly, typically within 24 hours.",
          ],
        },
      ]}
    />
  );
}
