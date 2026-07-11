import { LegalPage } from "../../components/LegalPage";

export default function TermsScreen() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 11, 2026"
      intro="These terms are an agreement between you and Plotlist. By creating an account or using the app, you agree to them. If you don't agree, please don't use Plotlist."
      sections={[
        {
          heading: "Your account",
          paragraphs: [
            "You need to be at least 13 years old to use Plotlist. You're responsible for the activity that happens on your account and for keeping access to your phone number and sign-in method secure.",
            "You can delete your account at any time from Settings. Deleting your account removes your profile and content from Plotlist.",
          ],
        },
        {
          heading: "Your content",
          paragraphs: [
            "Reviews, ratings, lists, comments, and profile details you post remain yours. By posting them you give Plotlist permission to store, display, and distribute them within the service — that's what makes profiles, feeds, and sharing work.",
            "You must have the right to post what you share, and you're responsible for it.",
          ],
        },
        {
          heading: "Acceptable use",
          paragraphs: [
            "Don't use Plotlist to harass, threaten, or impersonate people; to post spam, sexually explicit material involving minors, or content that's illegal where you live; or to interfere with the service (scraping, probing, or disrupting other people's use).",
            "We may remove content and suspend or terminate accounts that violate these terms or our Community Guidelines. There is no tolerance for objectionable content or abusive users.",
          ],
        },
        {
          heading: "Objectionable content and abuse",
          paragraphs: [
            "You can report any review, list, comment, watch log, or user from within the app, and you can block any user. Reports are reviewed and acted on promptly — typically within 24 hours — including removing the content and, where appropriate, the user who posted it.",
          ],
        },
        {
          heading: "The service",
          paragraphs: [
            "Plotlist is provided as-is, without warranties. Show metadata and artwork come from third-party sources (including TMDB) and may be incomplete or inaccurate. We may change or discontinue features at any time.",
            "To the fullest extent permitted by law, Plotlist is not liable for indirect or consequential damages arising from your use of the service.",
          ],
        },
        {
          heading: "Changes",
          paragraphs: [
            "We may update these terms as the service evolves. Material changes will be reflected on this page with a new effective date; continuing to use Plotlist after a change means you accept the updated terms.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [
            "Questions about these terms can be sent to ethanmckanna@gmail.com.",
          ],
        },
      ]}
    />
  );
}
