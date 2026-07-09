// Standard Expo Router entry. expo-router generates the route manifest from
// the `app/` directory at build time. We just register its root component.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// expo-router auto-discovers the route tree from `app/`. No config needed here.
registerRootComponent(ExpoRoot);
