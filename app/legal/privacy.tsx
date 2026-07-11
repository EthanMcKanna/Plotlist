import { LegalPage } from "../../components/LegalPage";

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 11, 2026"
      intro="This policy explains what Plotlist collects, why, and the choices you have."
      sections={[
        {
          heading: "What we collect",
          paragraphs: [
            "Account basics: your phone number (used to verify sign-in; stored as a one-way hash) or Apple ID sign-in, plus the profile details you choose to add — display name, username, bio, and avatar.",
            "Your activity: shows you track, ratings, reviews, watch logs, lists, comments, likes, follows, and notification preferences. This is the product — it's what renders your profile, stats, and your friends' feeds.",
            "Contacts, only if you opt in: contact matching hashes phone numbers on your device and compares hashes on the server. Raw contact numbers and names never leave your phone in the clear.",
            "Diagnostics: crash reports and performance traces (via Sentry) so we can fix bugs. These aren't used for advertising.",
          ],
        },
        {
          heading: "What we don't do",
          paragraphs: [
            "We don't sell your data. We don't show ads. We don't share your personal information with third parties except the service providers that run the app's infrastructure (hosting, push notifications, crash reporting), who process it only on our behalf.",
          ],
        },
        {
          heading: "Visibility and sharing",
          paragraphs: [
            "Your profile, reviews, and public lists are visible to other Plotlist users, and shared links to them open on the web. You can make your account private in Settings so only approved followers see your content, set per-section visibility, make lists private, and block users entirely.",
          ],
        },
        {
          heading: "Data retention and deletion",
          paragraphs: [
            "Your data is kept while your account is active. Deleting your account from Settings removes your profile and content. You can also export your data from Settings at any time.",
          ],
        },
        {
          heading: "Children",
          paragraphs: [
            "Plotlist is not directed at children under 13, and we don't knowingly collect data from them.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [
            "Privacy questions can be sent to ethanmckanna@gmail.com.",
          ],
        },
      ]}
    />
  );
}
