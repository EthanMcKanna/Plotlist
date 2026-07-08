import { StyleSheet, View } from "react-native";

// AuthGate owns the launch redirect (sign-in, onboarding, or home) and keeps
// the launch overlay up until the route settles, so the root route is just a
// dark placeholder — a <Redirect> here would race AuthGate's replace and
// cause a visible double navigation.
export default function Index() {
  return <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});
