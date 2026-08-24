package com.realestate.app.agent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.chaquo.python.Python

/**
 * وحدة أصلية تستدعي محرك كيمو البايثوني المضمَّن (عبر Chaquopy) داخل معالج
 * التطبيق. تفتح بايثون نفس ملف قاعدة التطبيق (expo-sqlite) فتكتب المحادثة في
 * agent_messages / agent_sessions مباشرةً. تُسجَّل في MainApplication.
 */
class KimoEngineModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "KimoEngine"

    @ReactMethod
    fun runChat(sessionId: String, text: String, dbName: String, mock: Int, promise: Promise) {
        try {
            val py = Python.getInstance()
            val dbPath = reactContext.getDatabasePath(dbName).absolutePath
            val module = py.getModule("kimo_embed")
            val result = module.callAttr("run_chat_sync", sessionId, text, dbPath, mock == 1)
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("KIMO_ERROR", e.localizedMessage ?: e.toString(), e)
        }
    }
}

class KimoEnginePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(KimoEngineModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
