// Settings stub.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Settings() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.box}>
        <Text style={styles.row}>Account</Text>
        <Text style={styles.row}>Sound</Text>
        <Text style={styles.row}>Haptics</Text>
        <Text style={styles.row}>About</Text>
      </View>

      <Pressable
        style={styles.btn}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.btnText}>Back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 28, fontWeight: '800', color: '#0e4a3a' },
  box: { backgroundColor: '#fff', padding: 16, borderRadius: 10, marginTop: 16 },
  row: { fontSize: 16, color: '#222', paddingVertical: 8 },
  btn: { backgroundColor: '#0e4a3a', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
