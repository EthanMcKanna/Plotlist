import { LandingPage } from "../components/LandingPage";

// Web: the signed-out front door is a marketing landing page at "/", and
// AuthGate leaves unauthenticated web visitors here (signed-in users are
// still redirected to /home before this renders for long).
export default function Index() {
  return <LandingPage />;
}
