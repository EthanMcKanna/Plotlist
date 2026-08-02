import { StyleSheet, View } from "react-native";

// Native: AuthGate owns the launch redirect (sign-in, onboarding, or home)
// and keeps the launch overlay up until the route settles, so the root
// route stays a dark placeholder — a <Redirect> here would race AuthGate's
// replace and cause a visible double navigation.
//
// The web front door lives in index.web.tsx so the 1,200-line LandingPage
// (plus its gradient/icon deps) never enters the native startup bundle.
export default function Index() {
  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});
