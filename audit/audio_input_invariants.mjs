import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const screen = fs.readFileSync(new URL('../src/screens/assistant/AssistantScreen.tsx', import.meta.url), 'utf8')
const executor = fs.readFileSync(new URL('../src/assistant/executor.ts', import.meta.url), 'utf8')
const providers = fs.readFileSync(new URL('../src/assistant/providers.ts', import.meta.url), 'utf8')
const appJson = fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')

assert.ok(packageJson.dependencies['expo-audio'], 'expo-audio dependency missing')
assert.match(screen, /useAudioRecorder\(RecordingPresets\.HIGH_QUALITY\)/)
assert.match(screen, /AudioModule\.requestRecordingPermissionsAsync\(\)/)
assert.match(screen, /accessibilityLabel=\{recorderState\.isRecording \? 'إيقاف التسجيل وإرساله' : 'بدء الإدخال الصوتي'\}/)
assert.match(screen, /sendUserMessage\(sid, trimmed, atts \|\| audio \? \{ attachments: atts, audio \}/)
assert.match(executor, /readAudioInput\(opts\.audio\.uri/)
assert.match(executor, /profile\.supports\.inputAudio/)
assert.match(executor, /input_audio: \{ data: audio\.base64, format: audio\.format \}/)
assert.match(providers, /VOICE_SUPPORT_GUIDE/)
assert.match(appJson, /expo-audio/)
assert.match(appJson, /expo-audio/)

console.log('Audio input invariants: PASS')
