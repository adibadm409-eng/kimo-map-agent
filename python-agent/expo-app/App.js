import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SERVER_URL } from "./ServerConfig";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState({
    provider_id: "openai",
    model: "",
    api_key: "",
    base_url: "",
  });
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState("جارٍ الاتصال بالمحرك…");
  const scrollRef = useRef(null);

  // جلب إعدادات المحرك والمزوّدات المتاحة
  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          fetch(`${SERVER_URL}/api/providers`).then((r) => r.json()),
          fetch(`${SERVER_URL}/api/settings`).then((r) => r.json()),
        ]);
        setProviders(p || []);
        setSettings((prev) => ({ ...prev, ...(s || {}) }));
        setStatus("المحرك متصل — جاهز");
      } catch (e) {
        setStatus("تعذّر الاتصال بالمحرك. تأكد أن الخادم يعمل وعنوان IP صحيح.");
      }
    })();
  }, []);

  const addMessage = (role, text, extra) =>
    setMessages((m) => [...m, { id: Date.now() + Math.random(), role, text, extra }]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    addMessage("user", text);
    setBusy(true);
    addMessage("assistant", "… يفكّر وينفّذ الأدوات");

    try {
      if (!sessionId) {
        const r = await fetch(`${SERVER_URL}/api/session`, { method: "POST" });
        const j = await r.json();
        setSessionId(j.session_id);
      }
      const r = await fetch(`${SERVER_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text }),
      });
      const j = await r.json();
      setMessages((m) => m.filter((x) => x.text !== "… يفكّر وينفّذ الأدوات"));
      (j.events || []).forEach((e) => {
        if (e.type === "observation") {
          addMessage("tool", `${e.title || ""}: ${e.detail || ""}`.slice(0, 200));
        }
      });
      addMessage("assistant", j.answer || "(لا يوجد رد)");
    } catch (e) {
      setMessages((m) => m.filter((x) => x.text !== "… يفكّر وينفّذ الأدوات"));
      addMessage("assistant", "تعذّر إرسال الرسالة: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    try {
      await fetch(`${SERVER_URL}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setShowSettings(false);
      Alert.alert("تم", "حُفظت الإعدادات وأُعيد بناء المحرك.");
    } catch (e) {
      Alert.alert("خطأ", "تعذّر حفظ الإعدادات: " + e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.htitle}>وكيل كيمو</Text>
        <Text style={styles.hstatus}>{status}</Text>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Text style={styles.hbtn}>الإعدادات</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.log}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.msg,
              m.role === "user" ? styles.user : m.role === "tool" ? styles.tool : styles.assistant,
            ]}
          >
            <Text style={styles.msgText}>{m.text}</Text>
          </View>
        ))}
        {busy && <ActivityIndicator style={{ margin: 10 }} color="#38bdf8" />}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="اكتب رسالتك…"
          placeholderTextColor="#64748b"
          onSubmitEditing={send}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={busy}>
          <Text style={styles.sendTxt}>إرسال</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SafeAreaView style={styles.modal}>
          <Text style={styles.modalTitle}>إعدادات المحرك</Text>

          <Text style={styles.label}>المزوّد</Text>
          <View style={styles.pickerRow}>
            {providers.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.chip,
                  settings.provider_id === p.id && styles.chipActive,
                ]}
                onPress={() => setSettings((s) => ({ ...s, provider_id: p.id }))}
              >
                <Text style={styles.chipTxt}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>النموذج</Text>
          <TextInput
            style={styles.field}
            value={settings.model}
            onChangeText={(v) => setSettings((s) => ({ ...s, model: v }))}
            placeholder="مثل gpt-4o"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>مفتاح الوصول</Text>
          <TextInput
            style={styles.field}
            value={settings.api_key}
            onChangeText={(v) => setSettings((s) => ({ ...s, api_key: v }))}
            placeholder="اختياري حسب المزوّد"
            placeholderTextColor="#64748b"
            secureTextEntry
          />

          <Text style={styles.label}>عنوان أساسي (اختياري)</Text>
          <TextInput
            style={styles.field}
            value={settings.base_url}
            onChangeText={(v) => setSettings((s) => ({ ...s, base_url: v }))}
            placeholder="للمزوّدات المحلية"
            placeholderTextColor="#64748b"
          />

          <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
            <Text style={styles.saveTxt}>حفظ</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(false)}>
            <Text style={styles.cancelTxt}>إلغاء</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", alignItems: "center", padding: 14,
    backgroundColor: "#1e293b", gap: 10,
  },
  htitle: { color: "#e2e8f0", fontWeight: "700", fontSize: 16, flex: 1 },
  hstatus: { color: "#94a3b8", fontSize: 11, flex: 2 },
  hbtn: { color: "#38bdf8", fontSize: 13 },
  log: { flex: 1, padding: 14, gap: 10 },
  msg: { maxWidth: "82%", padding: 10, borderRadius: 12 },
  user: { alignSelf: "flex-end", backgroundColor: "#38bdf8" },
  assistant: { alignSelf: "flex-start", backgroundColor: "#334155" },
  tool: { alignSelf: "flex-start", backgroundColor: "#0b1220", borderWidth: 1, borderColor: "#1e293b" },
  msgText: { color: "#e2e8f0", lineHeight: 20 },
  inputBar: { flexDirection: "row", padding: 12, backgroundColor: "#1e293b", gap: 8 },
  input: {
    flex: 1, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: "#334155",
    backgroundColor: "#0f172a", color: "#e2e8f0",
  },
  sendBtn: { paddingHorizontal: 18, justifyContent: "center", backgroundColor: "#38bdf8", borderRadius: 9 },
  sendTxt: { color: "#06283d", fontWeight: "700" },
  modal: { flex: 1, backgroundColor: "#0f172a", padding: 18, gap: 8 },
  modalTitle: { color: "#e2e8f0", fontSize: 18, fontWeight: "700", marginBottom: 10 },
  label: { color: "#94a3b8", fontSize: 12, marginTop: 8 },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { padding: 8, borderRadius: 8, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  chipActive: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  chipTxt: { color: "#e2e8f0", fontSize: 13 },
  field: {
    marginTop: 4, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: "#334155",
    backgroundColor: "#0f172a", color: "#e2e8f0",
  },
  saveBtn: { marginTop: 18, padding: 13, backgroundColor: "#38bdf8", borderRadius: 9, alignItems: "center" },
  saveTxt: { color: "#06283d", fontWeight: "700" },
  cancelTxt: { color: "#94a3b8", textAlign: "center", marginTop: 12 },
});
