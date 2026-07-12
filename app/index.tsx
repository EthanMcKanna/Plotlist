import { Platform, StyleSheet, View } from "react-native";

import { LandingPage } from "../components/LandingPage";

// Web: the signed-out front door is a marketing landing page at "/", and
// AuthGate leaves unauthenticated web visitors here (signed-in users are
// still redirected to /home before this renders for long).
//
// Native: AuthGate owns the launch redirect (sign-in, onboarding, or home)
// and keeps the launch overlay up until the route settles, so the root
// route stays a dark placeholder — a <Redirect> here would race AuthGate's
// replace and cause a visible double navigation.
export default function Index() {
  if (Platform.OS === "web") {
    return <LandingPage />;
  }
  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});
